import { Module } from '@nestjs/common';
import { FeeRulesService } from './fee-rules.service.js';
import {
  FeeRulesController,
  ReExamApplicationsController,
  StudentReExamsController,
} from './re-exams.controller.js';
import { ReExamsService } from './re-exams.service.js';

/** Phase 9B: re-exam applications, attempt tracking and versioned fee rules. */
@Module({
  controllers: [FeeRulesController, ReExamApplicationsController, StudentReExamsController],
  providers: [FeeRulesService, ReExamsService],
  exports: [FeeRulesService, ReExamsService],
})
export class ReExamsModule {}
