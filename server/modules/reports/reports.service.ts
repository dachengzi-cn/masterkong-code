import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { OnModuleInit } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { reportRecord } from '@server/database/schema';
import * as XLSX from 'xlsx-js-style';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import type {
  GenerateReportRequest,
  GetReportsResponse,
  ReportRecord,
  ReportSheetData,
} from '@shared/api.interface';

/** 数据库中 report_record 行的完整结构（含 schema 映射字段） */
interface ReportRecordRow {
  id: string;
  type: string;
  title: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  status: string;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

@Injectable()
export class ReportsService implements OnModuleInit {
  private readonly logger = new Logger(ReportsService.name);
  /** 报表文件存储目录（相对项目根目录） */
  private readonly storageDir = join(process.cwd(), 'server/storage/reports');

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async onModuleInit() {
    // 幂等建表：确保 report_record 表存在（迁移脚本可能未执行）
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS report_record (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          type varchar(100) NOT NULL,
          title varchar(500) NOT NULL,
          file_name varchar(255) NOT NULL,
          file_path text NOT NULL,
          file_size bigint NOT NULL DEFAULT 0,
          status varchar(20) NOT NULL DEFAULT 'ready',
          _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          _created_by user_profile,
          _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          _updated_by user_profile
        )
      `);
      await this.db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_report_record_type ON report_record(type)
      `);
      await this.db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_report_record_created ON report_record(_created_at)
      `);
    } catch (err) {
      this.logger.error(
        `报表表初始化失败（导出功能将不可用）: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    try {
      await mkdir(this.storageDir, { recursive: true });
    } catch (err) {
      this.logger.error(
        `报表存储目录创建失败（导出功能将不可用）: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ========== 生成 ==========

  /**
   * 根据前端上传的 sheets 描述生成 Excel 文件并持久化
   */
  async generate(request: GenerateReportRequest, userId: string): Promise<ReportRecord> {
    if (!request.sheets || request.sheets.length === 0) {
      throw new BadRequestException('报表内容为空，请刷新后重试');
    }
    if (request.sheets.length > 30) {
      throw new BadRequestException('报表 Sheet 数量超过限制（30）');
    }

    const wb = this.buildWorkbook(request.sheets);
    let buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    // showGridLines=false 的 sheet 需改写 XML 关闭网格线
    if (request.sheets.some((s) => s.showGridLines === false)) {
      buffer = this.hideGridlines(buffer);
    }

    const fileName = `${this.sanitizeFileName(request.fileName || '报表')}.xlsx`;
    const recordId = randomUUID();
    const relPath = `${recordId}.xlsx`;
    const absPath = join(this.storageDir, relPath);

    try {
      await mkdir(this.storageDir, { recursive: true });
      await writeFile(absPath, buffer);
    } catch (err) {
      this.logger.error(`报表文件写入失败: ${absPath}`, (err as Error).stack);
      throw new InternalServerErrorException(
        `报表文件写入失败，请检查服务器存储目录权限（${this.storageDir}）`,
      );
    }

    let row: ReportRecordRow | undefined;
    try {
      [row] = (await this.db
        .insert(reportRecord)
        .values({
          id: recordId,
          type: request.type || 'general',
          title: request.title || fileName,
          fileName,
          filePath: relPath,
          fileSize: buffer.length,
          status: 'ready',
          createdBy: userId,
        })
        .returning()) as unknown as ReportRecordRow[];
    } catch (err) {
      // 清理已写入的孤儿文件，避免磁盘残留
      await unlink(absPath).catch(() => undefined);
      this.logger.error('报表记录写入数据库失败', (err as Error).stack);
      throw new InternalServerErrorException(
        `报表记录写入失败：${(err as Error).message}（请确认数据库迁移已执行且 anon_ 角色具备 report_record 表权限）`,
      );
    }

    this.logger.log(`报表已生成: ${fileName} (${buffer.length} bytes)`);
    return this.toReportRecord(row);
  }

  // ========== 查询 ==========

  async findAll(params: {
    userId: string;
    type?: string;
    page?: number;
    pageSize?: number;
  }): Promise<GetReportsResponse> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

    // 报表仅对创建者可见（数据隔离）
    const conditions = [eq(reportRecord.createdBy, params.userId)];
    if (params.type) {
      conditions.push(eq(reportRecord.type, params.type));
    }
    const whereClause = and(...conditions);

    const totalRows = await this.db
      .select({ value: count() })
      .from(reportRecord)
      .where(whereClause);
    const total = Number(totalRows[0]?.value ?? 0);

    const rows = await this.db
      .select()
      .from(reportRecord)
      .where(whereClause)
      .orderBy(desc(reportRecord.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: rows.map((r) => this.toReportRecord(r as unknown as ReportRecordRow)),
      total,
    };
  }

  async findById(id: string): Promise<ReportRecord | null> {
    const rows = await this.db
      .select()
      .from(reportRecord)
      .where(eq(reportRecord.id, id))
      .limit(1);
    const row = rows[0] as unknown as ReportRecordRow | undefined;
    return row ? this.toReportRecord(row) : null;
  }

  /** 读取报表文件（用于预览/下载） */
  async getFile(id: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const record = await this.findById(id);
    if (!record) {
      throw new NotFoundException(`报表不存在: ${id}`);
    }
    const absPath = join(this.storageDir, `${record.id}.xlsx`);
    const buffer = await readFile(absPath);
    return {
      buffer,
      fileName: record.fileName,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async remove(id: string, userId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(reportRecord)
      .where(eq(reportRecord.id, id))
      .limit(1);
    const record = rows[0] as unknown as ReportRecordRow | undefined;
    if (!record) {
      throw new NotFoundException(`报表不存在: ${id}`);
    }
    // 权限校验：仅创建者可删除自己的报表（历史数据无归属记录时放行）
    if (record.createdBy && record.createdBy !== userId) {
      throw new ForbiddenException('无权删除他人创建的报表');
    }
    const absPath = join(this.storageDir, `${record.id}.xlsx`);
    await unlink(absPath).catch(() => undefined);
    await this.db.delete(reportRecord).where(eq(reportRecord.id, id));
    this.logger.log(`报表已删除: ${record.fileName}`);
  }

  /** 删除当前用户的全部报表（文件 + 记录），不影响其他用户数据 */
  async removeAll(userId: string): Promise<{ success: boolean; deletedCount: number }> {
    const rows = await this.db
      .select()
      .from(reportRecord)
      .where(eq(reportRecord.createdBy, userId));
    const records = rows as unknown as ReportRecordRow[];
    for (const record of records) {
      const absPath = join(this.storageDir, `${record.id}.xlsx`);
      await unlink(absPath).catch(() => undefined);
    }
    if (records.length > 0) {
      await this.db.delete(reportRecord).where(eq(reportRecord.createdBy, userId));
    }
    this.logger.log(`用户 ${userId} 已删除 ${records.length} 份报表`);
    return { success: true, deletedCount: records.length };
  }

  // ========== 内部工具 ==========

  private buildWorkbook(sheets: ReportSheetData[]) {
    const wb = XLSX.utils.book_new();
    for (const sheet of sheets) {
      const name = (sheet.sheetName || 'Sheet1').slice(0, 31);
      // rows 中单元格可为原始值或 { v, s } 对象，aoa_to_sheet 原生支持
      const ws = XLSX.utils.aoa_to_sheet(sheet.rows as unknown[][]);
      if (sheet.colWidths?.length) {
        ws['!cols'] = sheet.colWidths.map((w) =>
          w == null || w <= 0 ? { wch: 12 } : { wch: w },
        );
      }
      if (sheet.merges?.length) {
        ws['!merges'] = sheet.merges as XLSX.Range[];
      }
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    return wb;
  }

  /**
   * 将每个 sheet 的 sheetView 增加 showGridLines="0"，关闭网格线显示。
   * 兼容前端原有 hideGridlinesAndDownload 行为。
   */
  private hideGridlines(buffer: Buffer): Buffer {
    try {
      const files = unzipSync(new Uint8Array(buffer));
      for (const path of Object.keys(files)) {
        if (/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) {
          let xml = strFromU8(files[path]);
          xml = xml.replace(/<sheetView\b[^>]*?\/>|<sheetView\b[^>]*?>/g, (tag) => {
            if (tag.includes('showGridLines')) {
              return tag.replace(/showGridLines="[^"]*"/, 'showGridLines="0"');
            }
            const closing = tag.endsWith('/>') ? '/>' : '>';
            return tag.slice(0, -closing.length) + ' showGridLines="0"' + closing;
          });
          files[path] = strToU8(xml);
        }
      }
      return Buffer.from(zipSync(files, { level: 6 }));
    } catch (err) {
      this.logger.warn(`关闭网格线失败，忽略: ${(err as Error).message}`);
      return buffer;
    }
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  }

  private toReportRecord(row: ReportRecordRow): ReportRecord {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      fileName: row.fileName,
      fileSize: Number(row.fileSize ?? 0),
      status: row.status,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    };
  }
}
