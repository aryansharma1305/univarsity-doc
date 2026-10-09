import { Module } from '@nestjs/common';
import { FeeRulesService } from './fee-rules.service.js';
import { PaymentDestinationsService } from './payment-destinations.service.js';
import {
  PaymentDestinationsController,
  ReExamPaymentsController,
  StudentReExamPaymentsController,
} from './re-exam-payments.controller.js';
import { ReExamPaymentsService } from './re-exam-payments.service.js';
import {
  FeeRulesController,
  ReExamApplicationsController,
  StudentReExamsController,
} from './re-exams.controller.js';
import { ReExamsService } from './re-exams.service.js';

/**
 * Phase 9B: re-exam applications, attempt tracking and versioned fee rules.
 * Phase 9C: country/region payment destinations, payments and manual verification.
 */
@Module({
  controllers: [
    FeeRulesController,
    ReExamApplicationsController,
    StudentReExamsController,
    PaymentDestinationsController,
    ReExamPaymentsController,
    StudentReExamPaymentsController,
  ],
  providers: [FeeRulesService, ReExamsService, PaymentDestinationsService, ReExamPaymentsService],
  exports: [FeeRulesService, ReExamsService],
})
export class ReExamsModule {}
