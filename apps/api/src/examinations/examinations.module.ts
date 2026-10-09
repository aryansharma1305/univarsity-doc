import { Module } from '@nestjs/common';
import {
  ExaminationAppsController,
  ExaminationsController,
  StudentExaminationsController,
} from './examinations.controller.js';
import { ExaminationsService } from './examinations.service.js';

/** Phase 9A: external examination application links and examination records. */
@Module({
  controllers: [ExaminationAppsController, ExaminationsController, StudentExaminationsController],
  providers: [ExaminationsService],
  exports: [ExaminationsService],
})
export class ExaminationsModule {}
