import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';
import { WorkbookUploadInterceptor } from './upload.interceptor.js';

/** Phase 5: student / registration bulk imports (the worker runs the heavy steps). */
@Module({
  controllers: [ImportsController],
  providers: [ImportsService, WorkbookUploadInterceptor],
})
export class ImportsModule {}
