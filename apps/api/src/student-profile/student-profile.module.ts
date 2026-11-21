import { Module } from '@nestjs/common';
import { CommunicationModule } from '../communication/communication.module.js';
import { PhotoUploadInterceptor } from './photo-upload.interceptor.js';
import {
  ProfileRequestsController,
  StudentProfileController,
} from './profile-requests.controller.js';
import { ProfileRequestsService } from './profile-requests.service.js';

/** Phase 7: student profile change requests (student submission, staff approval). */
@Module({
  imports: [CommunicationModule],
  controllers: [StudentProfileController, ProfileRequestsController],
  providers: [ProfileRequestsService, PhotoUploadInterceptor],
})
export class StudentProfileModule {}
