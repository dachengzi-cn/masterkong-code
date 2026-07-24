import { Module, Global } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@server/database/schema';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DATABASE,
      useFactory: (): PostgresJsDatabase<typeof schema> => {
        const connectionString = process.env.SUDA_DATABASE_URL || 'postgresql://localhost:5432/postgres';
        const sql = postgres(connectionString, { max: 5 });
        return drizzle(sql, { schema });
      },
    },
  ],
  exports: [DRIZZLE_DATABASE],
})
export class LocalDatabaseModule {}
