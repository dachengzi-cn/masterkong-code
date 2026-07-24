import { Module } from '@nestjs/common';
import { CustomerProfileController } from './customer-profile.controller';
import { CustomerProfileService } from './customer-profile.service';

@Module({
  controllers: [CustomerProfileController],
  providers: [CustomerProfileService],
  exports: [CustomerProfileService],
})
export class CustomerProfileModule {}
