import { Module } from '@nestjs/common';
import { DatasetController } from './dataset.controller';
import { DatasetService } from './dataset.service';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module';
import { RouteProfileModule } from '../route-profile/route-profile.module';
import { ExpenseProfileModule } from '../expense-profile/expense-profile.module';

@Module({
  imports: [CustomerProfileModule, RouteProfileModule, ExpenseProfileModule],
  controllers: [DatasetController],
  providers: [DatasetService],
})
export class DatasetModule {}
