import { VerificationPoliciesService } from './verification-policies.service.js';
import { OfficialDocumentsService } from './official-documents.service.js';
import { OfficialResultsService } from './official-results.service.js';
import { OfficialVerificationService } from './official-verification.service.js';
import {
  VerificationPoliciesController,
  OfficialDocumentsController,
  OfficialResultsController,
  StudentOfficialDocumentsController,
} from './official-workflows.controller.js';
import { Module } from '@nestjs/common';
import { PublicVerificationController } from './public-verification.controller.js';
import { PublicVerificationGuard } from './public-verification.guard.js';
import { PublicVerificationServiceHandler } from './public-verification.service.js';
@Module({
  controllers: [
    PublicVerificationController,
    VerificationPoliciesController,
    OfficialDocumentsController,
    OfficialResultsController,
    StudentOfficialDocumentsController,
  ],
  providers: [
    PublicVerificationGuard,
    PublicVerificationServiceHandler,
    VerificationPoliciesService,
    OfficialDocumentsService,
    OfficialResultsService,
    OfficialVerificationService,
  ],
  exports: [VerificationPoliciesService, OfficialResultsService],
})
export class PublicVerificationModule {}
