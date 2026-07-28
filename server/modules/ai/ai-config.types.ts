export interface AiConfig {
  configKey: string;
  name: string;
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface DecryptedAiConfig extends AiConfig {
  id: string;
  isBuiltin: boolean;
  isActive: boolean;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
