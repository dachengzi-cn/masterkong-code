import { Module } from '@nestjs/common';
import { ExpenseProfileController } from './expense-profile.controller';
import { ExpenseProfileService } from './expense-profile.service';
import { ExpiryAnalysisService } from './expiry-analysis.service';
import { OverstockAnalysisService } from './overstock-analysis.service';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module';

@Module({
  imports: [CustomerProfileModule],
  controllers: [ExpenseProfileController],
  providers: [ExpenseProfileService, ExpiryAnalysisService, OverstockAnalysisService],
  exports: [ExpenseProfileService, ExpiryAnalysisService, OverstockAnalysisService],
})
export class ExpenseProfileModule {}
