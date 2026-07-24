import type { AiProvider, AiProviderId } from './types';

export const aiProviders: AiProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
    headers: { 'anthropic-version': '2023-06-01' },
  },
  {
    id: 'custom',
    name: '自定义',
    defaultBaseUrl: '',
    defaultModel: '',
  },
];

export function getAiProvider(id: AiProviderId): AiProvider | undefined {
  return aiProviders.find((provider) => provider.id === id);
}
