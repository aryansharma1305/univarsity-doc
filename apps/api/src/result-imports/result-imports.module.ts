import { Module } from '@nestjs/common';
import { WorkbookUploadInterceptor } from '../imports/upload.interceptor.js';
import { ResultImportsController } from './result-imports.controller.js';
import { ResultImportsService } from './result-imports.service.js';
import { ResultPreviewStore } from './result-preview.store.js';

/** Phase 10B: results import preview (temporary, owner-scoped; never writes results). */
@Module({
  controllers: [ResultImportsController],
  providers: [ResultImportsService, ResultPreviewStore, WorkbookUploadInterceptor],
})
export class ResultImportsModule {}
