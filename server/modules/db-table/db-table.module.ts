import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import postgres from 'postgres';
import { DbTableController } from './db-table.controller';
import { DbTableService } from './db-table.service';
import { PG_CLIENT } from './db-table.constants';

type Sql = ReturnType<typeof postgres>;

@Module({
  controllers: [DbTableController],
  providers: [
    DbTableService,
    {
      provide: PG_CLIENT,
      useFactory: () => {
        const connectionString =
          process.env.SUDA_DATABASE_URL || 'postgresql://localhost:5432/postgres';
        return postgres(connectionString, {
          max: 5,
          connection: { application_name: 'db-table-viewer' },
        });
      },
    },
  ],
  exports: [DbTableService],
})
export class DbTableModule implements OnModuleDestroy {
  constructor(@Inject(PG_CLIENT) private readonly sql: Sql) {}

  /** 应用关闭时释放连接池，避免连接泄漏 */
  onModuleDestroy() {
    void this.sql.end();
  }
}
