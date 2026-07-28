import { HttpException, Injectable } from '@nestjs/common';
import type { ChatCompletionsProxyDto } from './dto/chat-completions-proxy.dto';

export interface ChatCompletionsResult {
  data: unknown;
  latencyMs: number;
  statusCode: number;
}

export interface ChatCompletionsUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

@Injectable()
export class AiService {
  async chatCompletions(dto: ChatCompletionsProxyDto): Promise<ChatCompletionsResult> {
    const url = `${dto.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const body: Record<string, unknown> = {
      model: dto.model,
      messages: dto.messages,
    };

    if (dto.maxTokens !== undefined) {
      body.max_tokens = dto.maxTokens;
    }

    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dto.apiKey}`,
        ...(dto.headers ?? {}),
      },
      body: JSON.stringify(body),
    });

    const latencyMs = Date.now() - startTime;

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new HttpException(
        {
          ...(typeof data === 'object' && data !== null ? data : {}),
          latencyMs,
          statusCode: response.status,
        },
        response.status,
      );
    }

    return {
      data,
      latencyMs,
      statusCode: response.status,
    };
  }
}
