export type AiProviderId = 'openai' | 'deepseek' | 'anthropic' | 'custom' | string;

export interface AiProvider {
  id: AiProviderId;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  testModel?: string;
  headers?: Record<string, string>;
}

export interface AiConfig {
  providerId: AiProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AiModelEntry {
  id: string;
  name: string;
  providerId: AiProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AiModelStore {
  models: AiModelEntry[];
  activeModelId: string;
}

export type AiConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatResponse {
  content: string;
  raw: unknown;
}

export interface AiTestMetrics {
  latencyMs: number;
  statusCode: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AiTestResult {
  ok: true;
  content: string;
  metrics: AiTestMetrics;
  raw: unknown;
}

export interface AiTestError {
  ok: false;
  error: string;
  metrics?: Partial<AiTestMetrics>;
  raw?: unknown;
}
