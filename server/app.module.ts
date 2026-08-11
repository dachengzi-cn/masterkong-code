import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { DatasetModule } from './modules/dataset/dataset.module';
import { CustomerProfileModule } from './modules/customer-profile/customer-profile.module';
import { RouteMappingModule } from './modules/route-mapping/route-mapping.module';
import { RouteProfileModule } from './modules/route-profile/route-profile.module';
import { ExpenseProfileModule } from './modules/expense-profile/expense-profile.module';
import { LocalDatabaseModule } from './modules/local-database/local-database.module';
import { RuntimeModule } from './modules/runtime/runtime.module';
import { AiModule } from './modules/ai/ai.module';
import { AiAnalysisModule } from './modules/ai-analysis/ai-analysis.module';
import { DocGenModule } from './modules/doc-gen/doc-gen.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CapabilityModule } from './modules/capability/capability.module';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    PlatformModule.forRoot({
      enableCsrf: process.env.NODE_ENV === 'production',
    }),
    // 本地数据库模块（绕过 DataPaasModule 的 token 文件依赖）
    LocalDatabaseModule,
    // Mock Runtime Module（处理 account login/user 等 __runtime__ API）
    RuntimeModule,
    // ====== @route-section: business-modules START ======
    DatasetModule,
    CustomerProfileModule,
    RouteMappingModule,
    RouteProfileModule,
    ExpenseProfileModule,
    AiModule,
    AiAnalysisModule,
    DocGenModule,
    ReportsModule,
    CapabilityModule,
    // ====== @route-section: business-modules END ======

    // ️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
