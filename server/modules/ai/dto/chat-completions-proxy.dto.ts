export interface ChatCompletionsProxyDto {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
}
