import { Body, Controller, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { AiConfigService } from './ai-config.service';
import type { UpdateAiConfigDto } from './dto/update-ai-config.dto';
import type { TestAiConfigDto } from './dto/test-ai-config.dto';
import type {
  GetAiModelConfigsResponse,
  SetActiveAiModelConfigResponse,
  UpdateAiModelConfigResponse,
  TestAiModelConfigResponse,
} from '@shared/api.interface';

@Controller('api/ai-configs')
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  @Get()
  async findAll(): Promise<GetAiModelConfigsResponse> {
    return this.aiConfigService.findAll();
  }

  @Post(':configKey/activate')
  async setActive(@Param('configKey') configKey: string): Promise<SetActiveAiModelConfigResponse> {
    const result = await this.aiConfigService.setActive(configKey);
    return {
      success: true,
      activeConfigKey: result.activeConfigKey,
    };
  }

  @Put(':configKey')
  async update(
    @Param('configKey') configKey: string,
    @Body() dto: UpdateAiConfigDto,
  ): Promise<UpdateAiModelConfigResponse> {
    const item = await this.aiConfigService.update(configKey, dto);
    return { item };
  }

  @Post(':configKey/test')
  async testConnection(
    @Param('configKey') configKey: string,
    @Body() dto: TestAiConfigDto,
  ): Promise<TestAiModelConfigResponse> {
    if (dto.configKey && dto.configKey !== configKey) {
      throw new NotFoundException('Config key mismatch');
    }

    const result = await this.aiConfigService.testConnection(
      configKey,
      dto.messages,
      dto.maxTokens,
    );

    return {
      ok: result.ok,
      content: result.content,
      error: result.error,
      metrics: result.metrics
        ? {
            latencyMs: result.metrics.latencyMs,
            statusCode: result.metrics.statusCode,
            usage: result.metrics.usage
              ? {
                  promptTokens: result.metrics.usage.prompt_tokens,
                  completionTokens: result.metrics.usage.completion_tokens,
                  totalTokens: result.metrics.usage.total_tokens,
                }
              : undefined,
          }
        : undefined,
    };
  }
}
