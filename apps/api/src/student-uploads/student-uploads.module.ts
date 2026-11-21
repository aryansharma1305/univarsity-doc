import { Module } from '@nestjs/common';
import { DocumentUploadInterceptor } from '../historical-documents/document-upload.interceptor.js';
import {
  StaffStudentUploadsController,
  StudentOwnUploadsController,
} from './student-uploads.controller.js';
import { StudentUploadsService } from './student-uploads.service.js';
import { UploadThrottleInterceptor } from './upload-throttle.interceptor.js';

/** Student uploads: academic and identity documents a student uploads about themself. */
@Module({
  controllers: [StudentOwnUploadsController, StaffStudentUploadsController],
  providers: [StudentUploadsService, DocumentUploadInterceptor, UploadThrottleInterceptor],
})
export class StudentUploadsModule {}
