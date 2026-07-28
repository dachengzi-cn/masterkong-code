import { Injectable, Inject, Logger, NotFoundException, OnModuleInit, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, count } from 'drizzle-orm';
import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';
import type { AiConfig, DecryptedAiConfig } from './ai-config.types';
import { BUILTIN_AI_CONFIGS, AI_CONFIG_ENCRYPTION_KEY_ENV } from './ai-config.constants';
import { aiModelConfig } from '@server/database/schema';
import type { UpdateAiConfigDto } from './dto/update-ai-config.dto';
import { AiService } from './ai.service';
import type { ChatCompletionsResult, ChatCompletionsUsage } from './ai.service';

const MASKED_API_KEY = '••••••••';

@Injectable()
export class AiConfigService implements OnModuleInit {
  private readonly logger = new Logger(AiConfigService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly aiService: AiService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedBuiltinConfigs();
  }

  private getEncryptionKey(): string {
    const key = process.env[AI_CONFIG_ENCRYPTION_KEY_ENV];
    if (!key) {
      this.logger.warn(
        `${AI_CONFIG_ENCRYPTION_KEY_ENV} not set, falling back to a default key. ` +
          'Set a strong encryption key in production to protect API keys.',
      );
      return 'default-ai-config-encryption-key';
    }
    return key;
  }

  private encrypt(plainText: string): string {
    return AES.encrypt(plainText, this.getEncryptionKey()).toString();
  }

  private decrypt(cipherText: string): string {
    const bytes = AES.decrypt(cipherText, this.getEncryptionKey());
    return bytes.toString(Utf8);
  }

  private maskApiKey(apiKey: string): string {
    if (!apiKey) return '';
    if (apiKey.length <= 8) return MASKED_API_KEY;
    return apiKey.slice(0, 4) + '****' + apiKey.slice(-4);
  }

  private toDecryptedConfig(row: typeof aiModelConfig.$inferSelect): DecryptedAiConfig {
    return {
      id: row.id,
      configKey: row.configKey,
      name: row.name,
      providerId: row.providerId,
      apiKey: this.decrypt(row.apiKeyEncrypted),
      baseUrl: row.baseUrl,
      model: row.model,
      isBuiltin: row.isBuiltin,
      isActive: row.isActive,
      isEnabled: row.isEnabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toPublicItem(config: DecryptedAiConfig) {
    return {
      id: config.id,
      configKey: config.configKey,
      name: config.name,
      providerId: config.providerId,
      baseUrl: config.baseUrl,
      model: config.model,
      isBuiltin: config.isBuiltin,
      isActive: config.isActive,
      isEnabled: config.isEnabled,
      apiKeyMasked: this.maskApiKey(config.apiKey),
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  private async seedBuiltinConfigs(): Promise<void> {
    try {
      for (const builtin of BUILTIN_AI_CONFIGS) {
        const existing = await this.db
          .select({ id: aiModelConfig.id })
          .from(aiModelConfig)
          .where(eq(aiModelConfig.configKey, builtin.configKey))
          .limit(1);

        if (existing.length === 0) {
          await this.db.insert(aiModelConfig).values({
            configKey: builtin.configKey,
            name: builtin.name,
            providerId: builtin.providerId,
            apiKeyEncrypted: this.encrypt(builtin.apiKey),
            baseUrl: builtin.baseUrl,
            model: builtin.model,
            isBuiltin: true,
            isActive: builtin.configKey === BUILTIN_AI_CONFIGS[0].configKey,
            isEnabled: true,
          });
          this.logger.log(`Seeded built-in AI config: ${builtin.configKey}`);
        }
      }

      // 确保至少存在一个默认激活的配置
      const activeCount = await this.db
        .select({ value: count() })
        .from(aiModelConfig)
        .where(eq(aiModelConfig.isActive, true));

      if ((activeCount[0]?.value ?? 0) === 0) {
        const first = await this.db
          .select({ configKey: aiModelConfig.configKey })
          .from(aiModelConfig)
          .orderBy(aiModelConfig.createdAt)
          .limit(1);

        if (first.length > 0) {
          await this.db
            .update(aiModelConfig)
            .set({ isActive: true, updatedAt: new Date() })
            .where(eq(aiModelConfig.configKey, first[0].configKey));
        }
      }
    } catch (error) {
      this.logger.error('Failed to seed built-in AI configs', error instanceof Error ? error.stack : String(error));
    }
  }

  async findAll(): Promise<{ items: ReturnType<typeof this.toPublicItem>[]; activeConfigKey: string | null }> {
    const rows = await this.db.select().from(aiModelConfig).orderBy(aiModelConfig.createdAt);
    const configs = rows.map((row) => this.toDecryptedConfig(row));
    const activeConfig = configs.find((c) => c.isActive);
    return {
      items: configs.map((config) => this.toPublicItem(config)),
      activeConfigKey: activeConfig?.configKey ?? null,
    };
  }

  async findActiveConfig(): Promise<DecryptedAiConfig | null> {
    const rows = await this.db
      .select()
      .from(aiModelConfig)
      .where(eq(aiModelConfig.isActive, true))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    return this.toDecryptedConfig(rows[0]);
  }

  async findByConfigKey(configKey: string): Promise<DecryptedAiConfig | null> {
    const rows = await this.db
      .select()
      .from(aiModelConfig)
      .where(eq(aiModelConfig.configKey, configKey))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    return this.toDecryptedConfig(rows[0]);
  }

  async setActive(configKey: string): Promise<{ activeConfigKey: string | null }> {
    const config = await this.findByConfigKey(configKey);
    if (!config) {
      throw new NotFoundException(`AI config not found: ${configKey}`);
    }
    if (!config.isEnabled) {
      throw new BadRequestException('Cannot activate a disabled AI config');
    }

    await this.db.transaction(async (tx) => {
      await tx.update(aiModelConfig).set({ isActive: false }).where(eq(aiModelConfig.isActive, true));
      await tx
        .update(aiModelConfig)
        .set({ isActive: true })
        .where(eq(aiModelConfig.configKey, configKey));
    });

    return { activeConfigKey: configKey };
  }

  async update(configKey: string, dto: UpdateAiConfigDto): Promise<ReturnType<typeof this.toPublicItem>> {
    const config = await this.findByConfigKey(configKey);
    if (!config) {
      throw new NotFoundException(`AI config not found: ${configKey}`);
    }

    const updates: Partial<typeof aiModelConfig.$inferInsert> = {};

    if (dto.name !== undefined) updates.name = dto.name.trim();
    if (dto.providerId !== undefined) updates.providerId = dto.providerId.trim();
    if (dto.baseUrl !== undefined) updates.baseUrl = dto.baseUrl.trim();
    if (dto.model !== undefined) updates.model = dto.model.trim();
    if (dto.apiKey !== undefined) updates.apiKeyEncrypted = this.encrypt(dto.apiKey.trim());
    if (dto.isEnabled !== undefined) updates.isEnabled = dto.isEnabled;

    const rows = await this.db
      .update(aiModelConfig)
      .set(updates)
      .where(eq(aiModelConfig.configKey, configKey))
      .returning();

    const updated = this.toDecryptedConfig(rows[0]);
    return this.toPublicItem(updated);
  }

  async testConnection(
    configKey: string,
    messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: '你好，请简单回复一句话确认连接正常。' },
    ],
    maxTokens = 100,
  ): Promise<{
    ok: boolean;
    content?: string;
    error?: string;
    metrics?: { latencyMs: number; statusCode: number; usage?: ChatCompletionsUsage };
  }> {
    const config = await this.findByConfigKey(configKey);
    if (!config) {
      throw new NotFoundException(`AI config not found: ${configKey}`);
    }

    try {
      const result: ChatCompletionsResult = await this.aiService.chatCompletions({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages,
        maxTokens,
      });

      const responseData = result.data as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const message = responseData?.choices?.[0]?.message;
      const content = message?.content?.trim() || message?.reasoning_content?.trim();

      if (!content) {
        return {
          ok: false,
          error: '无法解析模型响应内容',
          metrics: {
            latencyMs: result.latencyMs,
            statusCode: result.statusCode,
          },
        };
      }

      return {
        ok: true,
        content,
        metrics: {
          latencyMs: result.latencyMs,
          statusCode: result.statusCode,
          usage: responseData?.usage,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接测试失败';
      return {
        ok: false,
        error: message,
      };
    }
  }
}
