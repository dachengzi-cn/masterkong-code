import { Module, Global, Injectable, Inject, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@server/database/schema';
import { ensureDatabaseSchema } from '@server/common/db-init';

/**
 * 数据库自动初始化兜底：main.ts 已在 Nest 应用创建前调用 ensureDatabaseSchema，
 * 此处再在 onApplicationBootstrap 阶段幂等执行一次，覆盖「运行时新建表（如 report_record）」
 * 的权限补齐，从根源上避免「运行时建表导致上传/导出 500」。
 *
 * 幂等设计：表/类型/角色/权限均为「已存在则跳过」，不影响存量数据。
 */
@Injectable()
class DatabasePrivilegesBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabasePrivilegesBootstrap.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async onApplicationBootstrap() {
    try {
      // 再次幂等执行完整初始化（含未来运行时新建表的默认权限）
      await ensureDatabaseSchema(
        process.env.SUDA_DATABASE_URL || 'postgresql://localhost:5432/postgres',
      );
      this.logger.log('数据库结构/权限自动初始化完成（幂等）');
    } catch (err) {
      this.logger.warn(`数据库自动初始化失败: ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DATABASE,
      useFactory: (): PostgresJsDatabase<typeof schema> => {
        const connectionString = process.env.SUDA_DATABASE_URL || 'postgresql://localhost:5432/postgres';
        const client = postgres(connectionString, { max: 5 });
        return drizzle(client, { schema });
      },
    },
    DatabasePrivilegesBootstrap,
  ],
  exports: [DRIZZLE_DATABASE],
})
export class LocalDatabaseModule {}
