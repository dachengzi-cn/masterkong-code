import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import postgres from 'postgres';
import { PG_CLIENT } from './db-table.constants';
import type {
  DbTableInfo,
  DbColumnInfo,
  DbColumnKind,
  DbColumnStats,
  DbTableListResponse,
  DbTableStructureResponse,
  DbTableDataResponse,
  DbTableDataParams,
  DbTableFilter,
  DbTableStatsResponse,
  DbTableExportJsonResponse,
} from '@shared/api.interface';

type Sql = ReturnType<typeof postgres>;
/** 可嵌入模板字符串的 SQL 片段（Query 对象） */
type Fragment = postgres.PendingQuery<any>;

/** 常见的内部/系统 schema，不对外展示 */
const INTERNAL_SCHEMAS = [
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'auth',
  'storage',
  'realtime',
  'supabase_migrations',
  'graphql',
  '_graphql',
  'vault',
  'extensions',
  'net',
  'cron',
  'supabase_functions',
  'pgbouncer',
];

/** 数值统计直方图分桶数 */
const HISTOGRAM_BUCKETS = 10;
/** 文本列高频值数量 */
const TOP_VALUES_LIMIT = 8;
/** JSON 导出行数上限 */
const EXPORT_JSON_LIMIT = 100000;

/**
 * 安全引用数据库标识符（表名/列名）。
 * postgres-js 的 `sql(name)` 生成的是参数占位符（字符串字面量），不能用于表/列引用；
 * 动态标识符必须用 `sql.unsafe` 拼接，并按 PG 规则转义内部双引号。
 */
function quoteIdent(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function classifyKind(dataType: string): DbColumnKind {
  switch (dataType) {
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'numeric':
    case 'decimal':
    case 'real':
    case 'double precision':
      return 'number';
    case 'date':
    case 'time':
    case 'time without time zone':
    case 'time with time zone':
    case 'timestamp':
    case 'timestamp without time zone':
    case 'timestamp with time zone':
      return 'date';
    case 'boolean':
      return 'boolean';
    case 'json':
    case 'jsonb':
      return 'json';
    case 'uuid':
      return 'uuid';
    default:
      return 'text';
  }
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

@Injectable()
export class DbTableService {
  private readonly logger = new Logger(DbTableService.name);

  constructor(@Inject(PG_CLIENT) private readonly sql: Sql) {}

  /** 动态表引用片段：schema.table（双引号引用后 unsafe 拼接） */
  private tableRef(schema: string, table: string): Fragment {
    return this.sql.unsafe(`${quoteIdent(schema)}.${quoteIdent(table)}`);
  }

  /** 动态列引用片段 */
  private columnRef(name: string): Fragment {
    return this.sql.unsafe(quoteIdent(name));
  }

  /** 连接串中的数据库名 */
  private databaseName(): string {
    const raw = process.env.SUDA_DATABASE_URL || 'postgresql://localhost:5432/postgres';
    try {
      const url = new URL(raw);
      return decodeURIComponent(url.pathname.replace(/^\//, '')) || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private databaseHost(): string {
    const raw = process.env.SUDA_DATABASE_URL || 'postgresql://localhost:5432/postgres';
    try {
      return new URL(raw).hostname;
    } catch {
      return '';
    }
  }

  /** 表列表（含连接信息） */
  async listTables(): Promise<DbTableListResponse> {
    const versionRows = await this.sql`SELECT version() AS v`;
    const version = versionRows[0]?.v ? String(versionRows[0].v).split('\n')[0] : null;

    const rows = await this.sql`
      SELECT
        t.table_schema,
        t.table_name,
        t.table_type,
        COALESCE(c.reltuples::bigint, 0) AS row_estimate,
        obj_description(c.oid) AS comment,
        (SELECT count(*)::int
           FROM information_schema.columns col
          WHERE col.table_schema = t.table_schema AND col.table_name = t.table_name) AS column_count
      FROM information_schema.tables t
      JOIN pg_catalog.pg_class c ON c.relname = t.table_name
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
      WHERE t.table_schema NOT IN ${this.sql(INTERNAL_SCHEMAS)}
        AND t.table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY (t.table_type = 'BASE TABLE') DESC, t.table_schema ASC, t.table_name ASC
    `;

    const tables: DbTableInfo[] = rows.map((r) => ({
      schema: r.table_schema,
      name: r.table_name,
      type: r.table_type,
      rowEstimate: Number(r.row_estimate ?? 0),
      comment: r.comment ?? null,
      columnCount: Number(r.column_count ?? 0),
    }));

    return { database: this.databaseName(), host: this.databaseHost(), version, tables };
  }

  /** 解析并校验表名（防止直接拼 SQL 注入） */
  private async resolveTable(raw: string): Promise<{ schema: string; table: string }> {
    const parts = raw.split('.');
    const schema = parts.length === 2 ? parts[0] : 'public';
    const table = parts.length === 2 ? parts[1] : parts[0];

    const rows = await this.sql`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = ${schema} AND table_name = ${table}
        AND table_type IN ('BASE TABLE', 'VIEW')
        AND table_schema NOT IN ${this.sql(INTERNAL_SCHEMAS)}
      LIMIT 1
    `;
    if (rows.length === 0) {
      throw new NotFoundException(`数据表不存在: ${raw}`);
    }
    return { schema: rows[0].table_schema, table: rows[0].table_name };
  }

  /** 获取表结构（列信息） */
  private async getColumns(schema: string, table: string): Promise<DbColumnInfo[]> {
    const tableRef = this.tableRef(schema, table);
    // regclass 需要文本参数（schema.table）而非标识符：
    // schema/table 已通过 resolveTable 白名单校验，此处分别参数化后在 SQL 层拼接，
    // 不引入任何字符串拼接的 SQL 文本
    const [colRows, keyRows] = await Promise.all([
      this.sql`
        SELECT
          c.column_name,
          c.ordinal_position,
          c.data_type,
          c.udt_name,
          (c.is_nullable = 'YES') AS is_nullable,
          c.column_default,
          c.character_maximum_length AS max_length,
          c.numeric_precision,
          c.numeric_scale,
          col_description((${schema} || '.' || ${table})::regclass, c.ordinal_position) AS comment
        FROM information_schema.columns c
        WHERE c.table_schema = ${schema} AND c.table_name = ${table}
        ORDER BY c.ordinal_position
      `,
      this.sql`
        SELECT a.attname AS name,
               bool_or(i.indisprimary) AS is_primary,
               bool_or(i.indisunique) AS is_unique
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = (${schema} || '.' || ${table})::regclass
        GROUP BY a.attname
      `,
    ]);

    const keyMap = new Map<string, { isPrimary: boolean; isUnique: boolean }>();
    for (const k of keyRows) {
      keyMap.set(k.name, { isPrimary: !!k.is_primary, isUnique: !!k.is_unique });
    }

    return colRows.map((c) => {
      const key = keyMap.get(c.column_name);
      return {
        name: c.column_name,
        ordinal: Number(c.ordinal_position),
        dataType: c.data_type,
        udtName: c.udt_name,
        isNullable: !!c.is_nullable,
        isPrimaryKey: key?.isPrimary ?? false,
        isUnique: key?.isUnique ?? false,
        columnDefault: c.column_default ?? null,
        comment: c.comment ?? null,
        maxLength: c.max_length != null ? Number(c.max_length) : null,
        numericPrecision: c.numeric_precision != null ? Number(c.numeric_precision) : null,
        numericScale: c.numeric_scale != null ? Number(c.numeric_scale) : null,
        kind: classifyKind(c.data_type),
      } as DbColumnInfo;
    });
  }

  /** 表结构 + 精确行数 */
  async getStructure(rawTable: string): Promise<DbTableStructureResponse> {
    const { schema, table } = await this.resolveTable(rawTable);
    const [columns, totalRows, info] = await Promise.all([
      this.getColumns(schema, table),
      this.countTotal(schema, table),
      this.tableInfo(schema, table),
    ]);
    return { table: info, columns, totalRows };
  }

  private async tableInfo(schema: string, table: string): Promise<DbTableInfo> {
    const rows = await this.sql`
      SELECT
        t.table_type,
        COALESCE(c.reltuples::bigint, 0) AS row_estimate,
        obj_description(c.oid) AS comment,
        (SELECT count(*)::int
           FROM information_schema.columns col
          WHERE col.table_schema = t.table_schema AND col.table_name = t.table_name) AS column_count
      FROM information_schema.tables t
      JOIN pg_catalog.pg_class c ON c.relname = t.table_name
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
      WHERE t.table_schema = ${schema} AND t.table_name = ${table}
      LIMIT 1
    `;
    const r = rows[0];
    return {
      schema,
      name: table,
      type: r?.table_type ?? 'BASE TABLE',
      rowEstimate: Number(r?.row_estimate ?? 0),
      comment: r?.comment ?? null,
      columnCount: Number(r?.column_count ?? 0),
    };
  }

  private async countTotal(schema: string, table: string): Promise<number> {
    const rows = await this.sql`
      SELECT count(*)::int AS total FROM ${this.tableRef(schema, table)}
    `;
    return rows[0]?.total ?? 0;
  }

  /** 构建 WHERE 片段（列名白名单校验 + 参数化值） */
  private buildWhere(
    columns: DbColumnInfo[],
    q?: string,
    filters?: Record<string, DbTableFilter>,
  ): Fragment {
    const colSet = new Set(columns.map((c) => c.name));
    const conds: Fragment[] = [];

    const keyword = q?.trim();
    if (keyword) {
      const searchCols = columns.filter(
        (c) => c.kind === 'text' || c.kind === 'uuid' || c.kind === 'json',
      );
      if (searchCols.length > 0) {
        const like = `%${keyword}%`;
        const ors = searchCols.map((c) =>
          this.sql`${this.columnRef(c.name)}::text ILIKE ${like}`,
        );
        conds.push(
          ors.length === 1
            ? ors[0]
            : (this.sql`(${ors[0]} ${ors.slice(1).map((o) => this.sql`OR ${o}`)})` as Fragment),
        );
      }
    }

    for (const [name, f] of Object.entries(filters ?? {})) {
      if (!colSet.has(name) || !f || typeof f !== 'object') continue;
      const col = this.columnRef(name);
      if (f.type === 'text') {
        if (typeof f.value === 'string' && f.value) {
          conds.push(this.sql`${col}::text ILIKE ${`%${f.value}%`}`);
        }
      } else if (f.type === 'number') {
        if (f.value !== undefined && f.value !== null && f.value !== '') {
          const n = Number(f.value);
          if (Number.isFinite(n)) conds.push(this.sql`${col} = ${n}`);
        }
        if (f.min !== undefined && f.min !== null && f.min !== '') {
          const n = Number(f.min);
          if (Number.isFinite(n)) conds.push(this.sql`${col} >= ${n}`);
        }
        if (f.max !== undefined && f.max !== null && f.max !== '') {
          const n = Number(f.max);
          if (Number.isFinite(n)) conds.push(this.sql`${col} <= ${n}`);
        }
      } else if (f.type === 'date') {
        if (typeof f.min === 'string' && f.min) {
          conds.push(this.sql`${col} >= ${f.min}::date`);
        }
        if (typeof f.max === 'string' && f.max) {
          conds.push(this.sql`${col} <= ${f.max}::date`);
        }
      } else if (f.type === 'boolean') {
        const v = f.value === true || f.value === 'true';
        conds.push(this.sql`${col} = ${v}`);
      }
    }

    if (conds.length === 0) return this.sql``;
    if (conds.length === 1) return this.sql`WHERE ${conds[0]}`;
    // postgres-js 数组片段以空格拼接，因此为后续条件各加一个 AND
    return this.sql`WHERE ${conds[0]} ${conds.slice(1).map((c) => this.sql`AND ${c}`)}`;
  }

  /** 分页数据（服务端排序 + 过滤 + 搜索） */
  async getData(rawTable: string, params: DbTableDataParams): Promise<DbTableDataResponse> {
    const { schema, table } = await this.resolveTable(rawTable);
    const columns = await this.getColumns(schema, table);

    const page = Math.max(1, Math.min(Number(params.page) || 1, 100000));
    const pageSize = Math.max(1, Math.min(Number(params.pageSize) || 100, 500));

    const where = this.buildWhere(columns, params.q, params.filters);

    let order: Fragment = this.sql``;
    if (params.sortBy && columns.some((c) => c.name === params.sortBy)) {
      const dir = params.sortDir === 'desc' ? 'DESC' : 'ASC';
      order = this.sql`ORDER BY ${this.columnRef(params.sortBy)} ${this.sql.unsafe(dir)}`;
    }

    const [countRows, dataRows] = await Promise.all([
      this.sql`SELECT count(*)::int AS total FROM ${this.tableRef(schema, table)} ${where}`,
      this.sql`
        SELECT * FROM ${this.tableRef(schema, table)}
        ${where}
        ${order}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `,
    ]);

    return {
      columns,
      rows: dataRows as Record<string, unknown>[],
      total: countRows[0]?.total ?? 0,
      page,
      pageSize,
    };
  }

  /** 各列统计（用于统计表 + 图表） */
  async getStats(rawTable: string): Promise<DbTableStatsResponse> {
    const { schema, table } = await this.resolveTable(rawTable);
    const columns = await this.getColumns(schema, table);
    const totalRows = await this.countTotal(schema, table);

    const stats = await Promise.all(
      columns.map((c) => this.columnStats(schema, table, c, totalRows)),
    );
    return { totalRows, columns: stats };
  }

  private async columnStats(
    schema: string,
    table: string,
    col: DbColumnInfo,
    totalRows: number,
  ): Promise<DbColumnStats> {
    const tableRef = this.tableRef(schema, table);
    const ident = this.columnRef(col.name);
    const base: DbColumnStats = {
      name: col.name,
      kind: col.kind,
      count: 0,
      totalCount: totalRows,
      nullCount: 0,
      distinctCount: null,
      min: null,
      max: null,
      sum: null,
      avg: null,
      topValues: [],
      histogram: [],
    };

    if (col.kind === 'number') {
      const r = (
        await this.sql`
          SELECT count(${ident})::int AS c,
                 count(DISTINCT ${ident})::int AS d,
                 min(${ident}) AS mn,
                 max(${ident}) AS mx,
                 sum(${ident}) AS s,
                 avg(${ident}) AS a
          FROM ${tableRef}
        `
      )[0];
      base.count = r.c ?? 0;
      base.nullCount = totalRows - base.count;
      base.distinctCount = r.d ?? null;
      base.min = toNumber(r.mn);
      base.max = toNumber(r.mx);
      base.sum = toNumber(r.s);
      base.avg = toNumber(r.a);

      // 直方图：采样后分桶（避免对超大表做全量扫描）
      const sample = await this.sql`
        SELECT ${ident} AS v
        FROM ${tableRef}
        WHERE ${ident} IS NOT NULL
        LIMIT 5000
      `;
      const values = sample
        .map((x) => Number(x.v))
        .filter((x) => Number.isFinite(x));
      if (values.length > 0) {
        const mn = Math.min(...values);
        const mx = Math.max(...values);
        const span = mx - mn || 1;
        const counts = new Array<number>(HISTOGRAM_BUCKETS).fill(0);
        for (const v of values) {
          const idx = Math.min(
            HISTOGRAM_BUCKETS - 1,
            Math.floor(((v - mn) / span) * HISTOGRAM_BUCKETS),
          );
          counts[idx]++;
        }
        base.histogram = counts.map((c, i) => {
          const lo = mn + (span * i) / HISTOGRAM_BUCKETS;
          const hi =
            i === HISTOGRAM_BUCKETS - 1
              ? mx
              : mn + (span * (i + 1)) / HISTOGRAM_BUCKETS;
          return { bucket: `${this.fmtNum(lo)} ~ ${this.fmtNum(hi)}`, count: c };
        });
      }
    } else if (col.kind === 'date') {
      const r = (
        await this.sql`
          SELECT count(${ident})::int AS c,
                 min(${ident}) AS mn,
                 max(${ident}) AS mx
          FROM ${tableRef}
        `
      )[0];
      base.count = r.c ?? 0;
      base.nullCount = totalRows - base.count;
      base.min = r.mn ? String(r.mn) : null;
      base.max = r.mx ? String(r.mx) : null;
      const daily = await this.sql`
        SELECT to_char(date_trunc('day', ${ident}), 'YYYY-MM-DD') AS bucket,
               count(*)::int AS c
        FROM ${tableRef}
        WHERE ${ident} IS NOT NULL
        GROUP BY 1
        ORDER BY 1
        LIMIT 120
      `;
      base.histogram = daily.map((d) => ({ bucket: d.bucket, count: d.c }));
    } else if (col.kind === 'boolean') {
      const r = (
        await this.sql`
          SELECT count(*) FILTER (WHERE ${ident} = true)::int AS t,
                 count(*) FILTER (WHERE ${ident} = false)::int AS f,
                 count(${ident})::int AS c
          FROM ${tableRef}
        `
      )[0];
      base.count = r.c ?? 0;
      base.nullCount = totalRows - base.count;
      const t = r.t ?? 0;
      const f = r.f ?? 0;
      base.distinctCount = (t > 0 ? 1 : 0) + (f > 0 ? 1 : 0) + (r.c > t + f ? 1 : 0);
      if (t > 0) base.topValues.push({ value: 'true', count: t });
      if (f > 0) base.topValues.push({ value: 'false', count: f });
    } else {
      // text / uuid / json
      const r = (
        await this.sql`
          SELECT count(${ident})::int AS c,
                 count(DISTINCT ${ident})::int AS d
          FROM ${tableRef}
        `
      )[0];
      base.count = r.c ?? 0;
      base.nullCount = totalRows - base.count;
      base.distinctCount = r.d ?? null;
      const top = await this.sql`
        SELECT ${ident}::text AS v,
               count(*)::int AS c
        FROM ${tableRef}
        WHERE ${ident} IS NOT NULL
        GROUP BY ${ident}::text
        ORDER BY c DESC
        LIMIT ${TOP_VALUES_LIMIT}
      `;
      base.topValues = top.map((t) => ({ value: t.v, count: t.c }));
    }

    return base;
  }

  private fmtNum(n: number): string {
    if (Math.abs(n) >= 1e6 || (Math.abs(n) < 1e-3 && n !== 0)) {
      return n.toExponential(2);
    }
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  /** 导出：CSV 流式写出（大数据量友好） */
  async exportCsv(
    rawTable: string,
    params: DbTableDataParams,
    res: { setHeader: (k: string, v: string) => void; write: (s: string) => void; end: () => void },
  ): Promise<void> {
    const { schema, table } = await this.resolveTable(rawTable);
    const columns = await this.getColumns(schema, table);
    const where = this.buildWhere(columns, params.q, params.filters);

    let order: Fragment = this.sql``;
    if (params.sortBy && columns.some((c) => c.name === params.sortBy)) {
      const dir = params.sortDir === 'desc' ? 'DESC' : 'ASC';
      order = this.sql`ORDER BY ${this.columnRef(params.sortBy)} ${this.sql.unsafe(dir)}`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
    // UTF-8 BOM，保证 Excel 直接打开中文不乱码
    res.write('\uFEFF');
    res.write(columns.map((c) => csvEscape(c.name)).join(',') + '\n');

    const query = this.sql`SELECT * FROM ${this.tableRef(schema, table)} ${where} ${order}`;
    try {
      for await (const rows of query.cursor(500)) {
        for (const row of rows) {
          res.write(columns.map((c) => csvEscape(csvString(row[c.name]))).join(',') + '\n');
        }
      }
    } finally {
      res.end();
    }
  }

  /** 导出：JSON（供前端生成 Excel） */
  async exportJson(
    rawTable: string,
    params: DbTableDataParams,
  ): Promise<DbTableExportJsonResponse> {
    const { schema, table } = await this.resolveTable(rawTable);
    const columns = await this.getColumns(schema, table);
    const where = this.buildWhere(columns, params.q, params.filters);

    const rows = await this.sql`
      SELECT * FROM ${this.tableRef(schema, table)}
      ${where}
      LIMIT ${EXPORT_JSON_LIMIT}
    `;
    return {
      columns,
      rows: rows as Record<string, unknown>[],
      count: rows.length,
    };
  }
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) {
    s = v.toISOString();
  } else if (typeof v === 'object') {
    s = JSON.stringify(v);
  } else {
    s = String(v);
  }
  // 字段统一加引号并转义内部引号，避免逗号/换行破坏 CSV 结构
  return `"${s.replace(/"/g, '""')}"`;
}

function csvString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
