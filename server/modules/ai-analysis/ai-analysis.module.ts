import { Module, OnModuleInit } from '@nestjs/common';
import { AiAnalysisController } from './ai-analysis.controller';
import { AiAnalysisService } from './ai-analysis.service';
import { SkillPreprocessor } from './skill-preprocessor';
import { SkillValidator } from './skill-validator';
import { SkillBenchmarkService } from './skill-benchmark.service';
import { SkillBenchmarkController } from './skill-benchmark.controller';
import { AnalysisPipelineService } from './analysis-pipeline.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [AiAnalysisController, SkillBenchmarkController],
  providers: [AiAnalysisService, SkillPreprocessor, SkillValidator, SkillBenchmarkService, AnalysisPipelineService],
  exports: [AiAnalysisService, SkillBenchmarkService, AnalysisPipelineService],
})
export class AiAnalysisModule implements OnModuleInit {
  constructor(private readonly aiAnalysisService: AiAnalysisService) {}

  async onModuleInit(): Promise<void> {
    await this.aiAnalysisService.seedBuiltinSkills();
  }
}
