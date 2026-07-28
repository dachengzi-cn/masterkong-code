import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  GetAiModelConfigsResponse,
  SetActiveAiModelConfigResponse,
  TestAiModelConfigRequest,
  TestAiModelConfigResponse,
  UpdateAiModelConfigRequest,
  UpdateAiModelConfigResponse,
} from '@shared/api.interface';

export async function getAiModelConfigs() {
  const res = await axiosForBackend({
    url: '/api/ai-configs',
    method: 'GET',
  });
  return res.data as GetAiModelConfigsResponse;
}

export async function setActiveAiModelConfig(configKey: string) {
  const res = await axiosForBackend({
    url: `/api/ai-configs/${encodeURIComponent(configKey)}/activate`,
    method: 'POST',
  });
  return res.data as SetActiveAiModelConfigResponse;
}

export async function updateAiModelConfig(
  configKey: string,
  data: UpdateAiModelConfigRequest,
) {
  const res = await axiosForBackend({
    url: `/api/ai-configs/${encodeURIComponent(configKey)}`,
    method: 'PUT',
    data,
  });
  return res.data as UpdateAiModelConfigResponse;
}

export async function testAiModelConfig(
  configKey: string,
  data?: Omit<TestAiModelConfigRequest, 'configKey'>,
) {
  const res = await axiosForBackend({
    url: `/api/ai-configs/${encodeURIComponent(configKey)}/test`,
    method: 'POST',
    data: {
      configKey,
      ...data,
    },
  });
  return res.data as TestAiModelConfigResponse;
}
