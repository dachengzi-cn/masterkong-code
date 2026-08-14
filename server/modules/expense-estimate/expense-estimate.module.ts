import { Module } from '@nestjs/common';
import { ExpenseEstimateController } from './expense-estimate.controller';
import { ExpenseEstimateService } from './expense-estimate.service';

@Module({
  controllers: [ExpenseEstimateController],
  providers: [ExpenseEstimateService],
  exports: [ExpenseEstimateService],
})
export class ExpenseEstimateModule {}
