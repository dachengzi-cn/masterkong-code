import { Module } from '@nestjs/common';
import { DocGenController } from './doc-gen.controller';
import { DocGenService } from './doc-gen.service';

@Module({
  controllers: [DocGenController],
  providers: [DocGenService],
  exports: [DocGenService],
})
export class DocGenModule {}
