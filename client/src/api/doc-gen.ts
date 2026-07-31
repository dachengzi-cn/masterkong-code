import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

// ========== 类型定义 ==========

export type DocCategory =
  | 'overview'
  | 'architecture'
  | 'modules'
  | 'api'
  | 'data-flow'
  | 'ui-design'
  | 'model-strategy';

export type DocSource = 'auto-generated' | 'manual' | 'ai-assisted';
export type DocStatus = 'draft' | 'published' | 'archived';

export interface DesignDoc {
  id: string;
  docKey: string;
  title: string;
  category: DocCategory;
  content: string;
  version: number;
  isLatest: boolean;
  source: DocSource;
  status: DocStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocListResponse {
  items: DesignDoc[];
}

export interface DocVersionDiff {
  docKey: string;
  fromVersion: number;
  toVersion: number;
  fromContent: string;
  toContent: string;
}

export interface AutoGenerateRequest {
  categories?: DocCategory[];
  overwrite?: boolean;
}

export interface UpsertDocRequest {
  docKey: string;
  title: string;
  category: DocCategory;
  content?: string;
  source?: DocSource;
  status?: DocStatus;
}

// ========== API 函数 ==========

/** 获取所有最新版文档 */
export async function getAllDocs(): Promise<DocListResponse> {
  const res = await axiosForBackend({ url: '/api/doc-gen/docs', method: 'GET' });
  return res.data as DocListResponse;
}

/** 按分类获取文档 */
export async function getDocsByCategory(category: DocCategory): Promise<DocListResponse> {
  const res = await axiosForBackend({
    url: `/api/doc-gen/docs/category/${category}`,
    method: 'GET',
  });
  return res.data as DocListResponse;
}

/** 按 docKey 获取最新版 */
export async function getDoc(docKey: string): Promise<{ item: DesignDoc | null }> {
  const res = await axiosForBackend({
    url: `/api/doc-gen/docs/${encodeURIComponent(docKey)}`,
    method: 'GET',
  });
  return res.data as { item: DesignDoc | null };
}

/** 获取版本历史 */
export async function getVersions(docKey: string): Promise<DocListResponse> {
  const res = await axiosForBackend({
    url: `/api/doc-gen/docs/${encodeURIComponent(docKey)}/versions`,
    method: 'GET',
  });
  return res.data as DocListResponse;
}

/** 版本对比 */
export async function getDiff(
  docKey: string,
  fromVersion: number,
  toVersion: number,
): Promise<DocVersionDiff> {
  const res = await axiosForBackend({
    url: `/api/doc-gen/docs/${encodeURIComponent(docKey)}/diff?from=${fromVersion}&to=${toVersion}`,
    method: 'GET',
  });
  return res.data as DocVersionDiff;
}

/** 创建文档 */
export async function createDoc(request: UpsertDocRequest): Promise<{ item: DesignDoc }> {
  const res = await axiosForBackend({
    url: '/api/doc-gen/docs',
    method: 'POST',
    data: request,
  });
  return res.data as { item: DesignDoc };
}

/** 更新文档（创建新版本） */
export async function updateDoc(
  docKey: string,
  request: Partial<UpsertDocRequest>,
): Promise<{ item: DesignDoc }> {
  const res = await axiosForBackend({
    url: `/api/doc-gen/docs/${encodeURIComponent(docKey)}`,
    method: 'PUT',
    data: request,
  });
  return res.data as { item: DesignDoc };
}

/** 删除文档 */
export async function deleteDoc(docKey: string): Promise<{ success: boolean }> {
  const res = await axiosForBackend({
    url: `/api/doc-gen/docs/${encodeURIComponent(docKey)}`,
    method: 'DELETE',
  });
  return res.data as { success: boolean };
}

/** 更新文档状态 */
export async function updateStatus(
  docKey: string,
  status: DocStatus,
): Promise<{ item: DesignDoc }> {
  const res = await axiosForBackend({
    url: `/api/doc-gen/docs/${encodeURIComponent(docKey)}/status`,
    method: 'PATCH',
    data: { status },
  });
  return res.data as { item: DesignDoc };
}

/** 自动生成 */
export async function autoGenerate(request: AutoGenerateRequest): Promise<DocListResponse> {
  const res = await axiosForBackend({
    url: '/api/doc-gen/auto-generate',
    method: 'POST',
    data: request,
  });
  return res.data as DocListResponse;
}
