import { Module } from '@nestjs/common';
import { RouteProfileController } from './route-profile.controller';
import { RouteProfileService } from './route-profile.service';

@Module({
  controllers: [RouteProfileController],
  providers: [RouteProfileService],
  exports: [RouteProfileService],
})
export class RouteProfileModule {}
