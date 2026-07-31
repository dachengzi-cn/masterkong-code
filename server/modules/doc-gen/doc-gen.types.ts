/** 设计文档分类 */
export type DocCategory =
  | 'overview'
  | 'architecture'
  | 'modules'
  | 'api'
  | 'data-flow'
  | 'ui-design'
  | 'model-strategy';

/** 文档来源 */
export type DocSource = 'auto-generated' | 'manual' | 'ai-assisted';

/** 文档状态 */
export type DocStatus = 'draft' | 'published' | 'archived';

/** 设计文档记录 */
export interface DesignDocRecord {
  id: string;
  docKey: string;
  title: string;
  category: DocCategory;
  content: string;
  version: number;
  isLatest: boolean;
  source: DocSource;
  status: DocStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** 创建/更新文档请求 */
export interface UpsertDocRequest {
  docKey: string;
  title: string;
  category: DocCategory;
  content?: string;
  source?: DocSource;
  status?: DocStatus;
}

/** 自动生成请求 */
export interface AutoGenerateRequest {
  /** 要生成的分类列表，为空则生成全部 */
  categories?: DocCategory[];
  /** 是否覆盖已有最新版本 */
  overwrite?: boolean;
}

/** 文档版本对比 */
export interface DocVersionDiff {
  docKey: string;
  fromVersion: number;
  toVersion: number;
  fromContent: string;
  toContent: string;
}
