export interface TestAiConfigDto {
  configKey: string;
  messages?: Array<{ role: string; content: string }>;
  maxTokens?: number;
}
