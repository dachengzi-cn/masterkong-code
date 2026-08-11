import { Module } from '@nestjs/common';
import { CapabilityController } from './capability.controller';
import { CapabilityService } from './capability.service';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module';
import { ExpenseProfileModule } from '../expense-profile/expense-profile.module';

@Module({
  imports: [CustomerProfileModule, ExpenseProfileModule],
  controllers: [CapabilityController],
  providers: [CapabilityService],
  exports: [CapabilityService],
})
export class CapabilityModule {}
