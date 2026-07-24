import { getAiProvider } from './providers';
import type {
  AiChatMessage,
  AiChatResponse,
  AiConfig,
  AiTestError,
  AiTestMetrics,
  AiTestResult,
} from './types';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface ProxySuccessResponse {
  data: unknown;
  latencyMs: number;
  statusCode: number;
}

function getProviderHeaders(config: AiConfig): Record<string, string> {
  const provider = getAiProvider(config.providerId);
  return provider?.headers ?? {};
}

function extractUsage(raw: unknown): AiTestMetrics['usage'] {
  const response = raw as ChatCompletionResponse;
  if (!response?.usage) {
    return undefined;
  }
  return {
    promptTokens: response.usage.prompt_tokens,
    completionTokens: response.usage.completion_tokens,
    totalTokens: response.usage.total_tokens,
  };
}

function extractContent(raw: unknown): string | undefined {
  const response = raw as ChatCompletionResponse;
  const message = response?.choices?.[0]?.message;
  if (!message) {
    return undefined;
  }
  return message.content?.trim() || message.reasoning_content?.trim() || undefined;
}

function extractErrorMessage(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }

  const response = raw as Record<string, unknown>;
  if (typeof response.error === 'string') {
    return response.error;
  }

  if (response.error && typeof response.error === 'object') {
    const errorObj = response.error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') {
      return errorObj.message;
    }
  }

  if (typeof response.message === 'string') {
    return response.message;
  }

  return undefined;
}

async function postChatCompletions(
  config: AiConfig,
  messages: AiChatMessage[],
  maxTokens?: number,
): Promise<{ ok: true; response: ProxySuccessResponse } | { ok: false; error: string; raw?: unknown }> {
  const body: Record<string, unknown> = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    messages,
    headers: getProviderHeaders(config),
  };

  if (maxTokens !== undefined) {
    body.maxTokens = maxTokens;
  }

  try {
    // 通过后端代理转发请求，避免浏览器 CORS 限制并保护 API 密钥
    // eslint-disable-next-line no-restricted-syntax
    const response = await fetch('/api/ai/chat-completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        error: extractErrorMessage(data) ?? `HTTP ${response.status}: ${response.statusText}`,
        raw: data,
      };
    }

    const proxyResponse = data as ProxySuccessResponse;
    if (
      typeof proxyResponse.latencyMs !== 'number' ||
      typeof proxyResponse.statusCode !== 'number'
    ) {
      return {
        ok: false,
        error: '后端代理返回格式异常，缺少延迟或状态码信息',
        raw: data,
      };
    }

    return { ok: true, response: proxyResponse };
  } catch (error) {
    const message = error instanceof Error ? error.message : '网络请求失败，请检查网络连接或后端服务是否正常';
    return { ok: false, error: message };
  }
}

export async function testConnection(
  config: AiConfig,
): Promise<AiTestResult | AiTestError> {
  const messages: AiChatMessage[] = [
    { role: 'user', content: '你好，请简单回复一句话确认连接正常。' },
  ];

  const result = await postChatCompletions(config, messages, 100);

  if (result.ok === false) {
    return {
      ok: false,
      error: result.error,
      raw: result.raw,
    };
  }

  const content = extractContent(result.response.data);
  if (content === undefined || content === '') {
    return {
      ok: false,
      error: '无法解析模型响应内容',
      metrics: {
        latencyMs: result.response.latencyMs,
        statusCode: result.response.statusCode,
      },
      raw: result.response.data,
    };
  }

  return {
    ok: true,
    content,
    metrics: {
      latencyMs: result.response.latencyMs,
      statusCode: result.response.statusCode,
      usage: extractUsage(result.response.data),
    },
    raw: result.response.data,
  };
}

export async function chat(config: AiConfig, messages: AiChatMessage[]): Promise<AiChatResponse> {
  const result = await postChatCompletions(config, messages);

  if (result.ok === false) {
    throw new Error(result.error);
  }

  const content = extractContent(result.response.data) ?? '';

  return {
    content,
    raw: result.response.data,
  };
}
