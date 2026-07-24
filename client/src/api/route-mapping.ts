import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  GetRouteMappingsParams,
  GetRouteMappingsResponse,
  UploadRouteMappingRequest,
  UploadRouteMappingResponse,
  DeleteRouteMappingResponse,
} from '@shared/api.interface';

export async function getRouteMappings(params?: GetRouteMappingsParams): Promise<GetRouteMappingsResponse> {
  const res = await axiosForBackend({
    url: '/api/route-mappings',
    method: 'GET',
    params,
  });
  return res.data as GetRouteMappingsResponse;
}

export async function uploadRouteMappings(
  data: UploadRouteMappingRequest,
  onProgress?: (done: number, total: number) => void,
): Promise<UploadRouteMappingResponse> {
  const total = data.mappings.length;
  const BATCH_SIZE = 50;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = data.mappings.slice(i, i + BATCH_SIZE);
    const res = await axiosForBackend({
      url: '/api/route-mappings',
      method: 'POST',
      data: { mappings: batch },
    });
    const result = res.data as UploadRouteMappingResponse;
    inserted += result.inserted;
    updated += result.updated;
    onProgress?.(Math.min(i + BATCH_SIZE, total), total);
  }

  return { inserted, updated, total };
}

export async function deleteRouteMapping(id: string): Promise<DeleteRouteMappingResponse> {
  const res = await axiosForBackend({
    url: `/api/route-mappings/${id}`,
    method: 'DELETE',
  });
  return res.data as DeleteRouteMappingResponse;
}
