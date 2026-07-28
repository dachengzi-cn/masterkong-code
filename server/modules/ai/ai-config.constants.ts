import type { AiConfig } from './ai-config.types';

export const BUILTIN_AI_CONFIGS: AiConfig[] = [
  {
    configKey: 'agnes',
    name: 'Agnes',
    providerId: 'custom',
    apiKey: 'sk-ps9qCFtCLPHRzDmCHUqCo2M3gcGS4Jhebbrpa9BjUQrqPpNu',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    model: 'agnes-2.0-flash',
  },
  {
    configKey: 'nvidia-deepseek-v4',
    name: '英伟达-Deepseek V4',
    providerId: 'custom',
    apiKey: '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',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'deepseek-ai/deepseek-v4-pro',
  },
  {
    configKey: 'nvidia-glm-5-2',
    name: '英伟达-GLM-5.2',
    providerId: 'custom',
    apiKey: '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',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'z-ai/glm-5.2',
  },
];

export const AI_CONFIG_ENCRYPTION_KEY_ENV = 'AI_CONFIG_ENCRYPTION_KEY';
