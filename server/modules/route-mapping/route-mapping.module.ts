import { Module } from '@nestjs/common';
import { RouteMappingController } from './route-mapping.controller';
import { RouteMappingService } from './route-mapping.service';

@Module({
  controllers: [RouteMappingController],
  providers: [RouteMappingService],
  exports: [RouteMappingService],
})
export class RouteMappingModule {}
