import { Module } from '@nestjs/common';
import { DocumentUploadInterceptor } from './document-upload.interceptor.js';
import {
  HistoricalDocumentsController,
  StudentDocumentsController,
} from './historical-documents.controller.js';
import { HistoricalDocumentsService } from './historical-documents.service.js';

/** Phase 8: staff-managed historical documents and the student document library. */
@Module({
  controllers: [HistoricalDocumentsController, StudentDocumentsController],
  providers: [HistoricalDocumentsService, DocumentUploadInterceptor],
})
export class HistoricalDocumentsModule {}
