import { Module, Global, Injectable, Inject, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '@server/database/schema';

/**
 * 应用启动后自动为 anon_ 角色补发数据库权限，从根源上避免「运行时建表导致导出 500」。
 *
 * 背景：datapaas 中间件会以 anon_ 角色执行业务 SQL，而部分表（如 report_record）
 * 由服务在运行时创建、不经过迁移脚本，新环境部署后 anon_ 角色缺少权限即报 42501。
 *
 * 本引导在 onApplicationBootstrap 阶段执行（晚于所有模块的 onModuleInit，
 * 即运行时创建的表已就绪），一次性补齐：
 *  1. 当前已存在的所有表/序列的权限
 *  2. 默认权限——未来任何新建的表/序列自动获得授权，无需任何迁移或手工步骤
 */
@Injectable()
class DatabasePrivilegesBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabasePrivilegesBootstrap.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async onApplicationBootstrap() {
    try {
      await this.db.execute(sql`
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon_
      `);
      await this.db.execute(sql`
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon_
      `);
      await this.db.execute(sql`
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon_
      `);
      await this.db.execute(sql`
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO anon_
      `);
      this.logger.log('已自动授予 anon_ 角色全部业务表/序列权限（含未来新表的默认权限）');
    } catch (err) {
      this.logger.warn(
        `自动授予 anon_ 角色权限失败（anon_ 角色可能不存在，或无授权权限）: ${(err as Error).message}`,
      );
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
