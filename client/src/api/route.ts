import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  UploadRouteRequest,
  UploadRouteResponse,
  GetRoutesParams,
  GetRoutesResponse,
  DeleteRouteResponse,
  GetRouteUploadRecordResponse,
} from '@shared/api.interface';

export async function getLatestUploadRecord(): Promise<GetRouteUploadRecordResponse> {
  try {
    const res = await axiosForBackend({
      url: '/api/routes/upload-record',
      method: 'GET',
    });
    return res.data as GetRouteUploadRecordResponse;
  } catch (e) {
    console.error('获取线路资料上传记录失败:', e);
    return null;
  }
}

export async function getRoutes(params?: GetRoutesParams): Promise<GetRoutesResponse> {
  const res = await axiosForBackend({
    url: '/api/routes',
    method: 'GET',
    params,
  });
  return res.data as GetRoutesResponse;
}

export async function uploadRoutes(
  data: UploadRouteRequest,
  onProgress?: (done: number, total: number) => void,
): Promise<UploadRouteResponse> {
  const CHUNK = 50;
  const all = data.routes;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    try {
      const res = await axiosForBackend({
        url: '/api/routes',
        method: 'POST',
        data: { routes: chunk },
      });
      const r = res.data as UploadRouteResponse;
      inserted += r.inserted;
      updated += r.updated;
    } catch (e) {
      const errorMsg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null && (e as any).message
            ? (e as any).message
            : '未知错误';
      const detail =
        e &&
        typeof e === 'object' &&
        (e as any).response &&
        (e as any).response.data
          ? (e as any).response.data.error?.message || errorMsg
          : errorMsg;
      console.error(`上传线路资料失败 (chunk start=${i} size=${chunk.length}): ${detail}`);
      throw new Error(detail);
    }
    onProgress?.(Math.min(i + CHUNK, all.length), all.length);
  }

  return { inserted, updated, total: all.length };
}

export async function removeAllRoutes(): Promise<DeleteRouteResponse> {
  const res = await axiosForBackend({
    url: '/api/routes',
    method: 'DELETE',
  });
  return res.data as DeleteRouteResponse;
}

export async function removeRoute(id: string): Promise<DeleteRouteResponse> {
  const res = await axiosForBackend({
    url: `/api/routes/${id}`,
    method: 'DELETE',
  });
  return res.data as DeleteRouteResponse;
}

export async function getRouteNames(): Promise<string[]> {
  const res = await axiosForBackend({
    url: '/api/routes/names',
    method: 'GET',
  });
  return res.data as string[];
}
