import type { AiConfig } from './ai-config.types';

// 内置 AI 模型配置，启动时自动写入数据库（API Key 加密存储）
export const BUILTIN_AI_CONFIGS: AiConfig[] = [
  {
    configKey: 'nvidia-glm-5-2',
    name: '英伟达-GLM-5.2',
    providerId: 'custom',
    apiKey: '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',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'z-ai/glm-5.2',
  },
  {
    configKey: 'nvidia-minimax-m3',
    name: '英伟达-MiniMax-M3',
    providerId: 'custom',
    apiKey: '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',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'minimaxai/minimax-m3',
  },
  {
    configKey: 'nvidia-deepseek-v4',
    name: '英伟达-Deepseek V4',
    providerId: 'custom',
    apiKey: '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',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'deepseek-ai/deepseek-v4-pro',
  },
];

export const AI_CONFIG_ENCRYPTION_KEY_ENV = 'AI_CONFIG_ENCRYPTION_KEY';
