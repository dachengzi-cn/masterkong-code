import { Body, Controller, Delete, Get, Param, Post, Put, Patch, Query } from '@nestjs/common';
import { DocGenService } from './doc-gen.service';
import type { UpsertDocRequest, AutoGenerateRequest, DocCategory } from './doc-gen.types';

@Controller('api/doc-gen')
export class DocGenController {
  constructor(private readonly docGenService: DocGenService) {}

  // ========== 查询 ==========

  /** 获取所有最新版文档 */
  @Get('docs')
  async findAllLatest() {
    const docs = await this.docGenService.findAllLatest();
    return {
      items: docs.map((d) => this.formatDoc(d)),
    };
  }

  /** 按分类获取文档 */
  @Get('docs/category/:category')
  async findByCategory(@Param('category') category: DocCategory) {
    const docs = await this.docGenService.findLatestByCategory(category);
    return {
      items: docs.map((d) => this.formatDoc(d)),
    };
  }

  /** 按 docKey 获取最新版 */
  @Get('docs/:docKey')
  async findByKey(@Param('docKey') docKey: string) {
    const doc = await this.docGenService.findLatestByKey(docKey);
    if (!doc) {
      return { item: null };
    }
    return { item: this.formatDoc(doc) };
  }

  /** 获取版本历史 */
  @Get('docs/:docKey/versions')
  async getVersions(@Param('docKey') docKey: string) {
    const versions = await this.docGenService.getVersionHistory(docKey);
    return {
      items: versions.map((v) => this.formatDoc(v)),
    };
  }

  /** 版本对比 */
  @Get('docs/:docKey/diff')
  async getDiff(
    @Param('docKey') docKey: string,
    @Query('from') fromVersion: string,
    @Query('to') toVersion: string,
  ) {
    const versions = await this.docGenService.getVersionHistory(docKey);
    const fromV = parseInt(fromVersion, 10);
    const toV = parseInt(toVersion, 10);
    const fromDoc = versions.find((v) => v.version === fromV);
    const toDoc = versions.find((v) => v.version === toV);
    if (!fromDoc || !toDoc) {
      return { error: '版本不存在' };
    }
    return {
      docKey,
      fromVersion: fromV,
      toVersion: toV,
      fromContent: fromDoc.content,
      toContent: toDoc.content,
    };
  }

  // ========== 创建 / 更新 ==========

  /** 创建文档 */
  @Post('docs')
  async createDoc(@Body() body: UpsertDocRequest) {
    const doc = await this.docGenService.upsertDoc(body);
    return { item: this.formatDoc(doc) };
  }

  /** 更新文档（创建新版本） */
  @Put('docs/:docKey')
  async updateDoc(
    @Param('docKey') docKey: string,
    @Body() body: Partial<UpsertDocRequest>,
  ) {
    const existing = await this.docGenService.findLatestByKey(docKey);
    if (!existing) {
      return { error: '文档不存在' };
    }
    const doc = await this.docGenService.upsertDoc({
      docKey,
      title: body.title ?? existing.title,
      category: body.category ?? existing.category,
      content: body.content ?? existing.content,
      source: body.source ?? 'manual',
      status: body.status ?? existing.status,
    });
    return { item: this.formatDoc(doc) };
  }

  /** 删除文档（所有版本） */
  @Delete('docs/:docKey')
  async deleteDoc(@Param('docKey') docKey: string) {
    await this.docGenService.deleteDoc(docKey);
    return { success: true };
  }

  /** 更新文档状态 */
  @Patch('docs/:docKey/status')
  async updateStatus(
    @Param('docKey') docKey: string,
    @Body() body: { status: string },
  ) {
    const doc = await this.docGenService.updateStatus(docKey, body.status);
    return { item: this.formatDoc(doc) };
  }

  // ========== 自动生成 ==========

  /** 自动生成设计文档 */
  @Post('auto-generate')
  async autoGenerate(@Body() body: AutoGenerateRequest) {
    const docs = await this.docGenService.autoGenerate(body);
    return {
      items: docs.map((d) => this.formatDoc(d)),
    };
  }

  // ========== 工具方法 ==========

  private formatDoc(d: any) {
    return {
      id: d.id,
      docKey: d.docKey,
      title: d.title,
      category: d.category,
      content: d.content,
      version: d.version,
      isLatest: d.isLatest,
      source: d.source,
      status: d.status,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : String(d.updatedAt),
    };
  }
}
