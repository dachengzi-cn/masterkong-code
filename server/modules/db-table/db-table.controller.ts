import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DbTableService } from './db-table.service';
import type {
  DbTableListResponse,
  DbTableStructureResponse,
  DbTableDataResponse,
  DbTableDataParams,
  DbTableFilter,
  DbTableStatsResponse,
} from '@shared/api.interface';

@Controller('api/db-tables')
export class DbTableController {
  constructor(private readonly dbTableService: DbTableService) {}

  @Get()
  async listTables(): Promise<DbTableListResponse> {
    return this.dbTableService.listTables();
  }

  @Get(':table/export')
  async export(
    @Param('table') table: string,
    @Query('format') format: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('q') q?: string,
    @Query('filters') filtersRaw?: string,
    @Res() res?: Response,
  ): Promise<void> {
    const params = parseParams({ sortBy, sortDir, q, filtersRaw });
    if (format === 'json') {
      // 注入了 @Res() 后为手动响应模式，需自行写出 JSON 响应
      const data = await this.dbTableService.exportJson(table, params);
      res!.setHeader('Content-Type', 'application/json; charset=utf-8');
      res!.end(JSON.stringify(data));
      return;
    }
    await this.dbTableService.exportCsv(table, params, res!);
  }

  @Get(':table/stats')
  async getStats(@Param('table') table: string): Promise<DbTableStatsResponse> {
    return this.dbTableService.getStats(table);
  }

  @Get(':table/data')
  async getData(
    @Param('table') table: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('q') q?: string,
    @Query('filters') filtersRaw?: string,
  ): Promise<DbTableDataResponse> {
    return this.dbTableService.getData(table, {
      ...parseParams({ sortBy, sortDir, q, filtersRaw }),
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':table')
  async getStructure(@Param('table') table: string): Promise<DbTableStructureResponse> {
    return this.dbTableService.getStructure(table);
  }
}

function parseParams(input: {
  sortBy?: string;
  sortDir?: string;
  q?: string;
  filtersRaw?: string;
}): DbTableDataParams {
  const params: DbTableDataParams = {};
  if (input.sortBy) params.sortBy = input.sortBy;
  if (input.sortDir === 'asc' || input.sortDir === 'desc') {
    params.sortDir = input.sortDir;
  }
  if (input.q) params.q = input.q;
  if (input.filtersRaw) {
    try {
      const parsed = JSON.parse(input.filtersRaw) as Record<string, DbTableFilter>;
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        params.filters = parsed;
      }
    } catch {
      // 忽略非法 filters 参数
    }
  }
  return params;
}
