import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { CertificateRequestsModule } from '../certificate-requests/certificate-requests.module.js';
import {
  CertificateEligibilityController,
  StudentCertificateEligibilityController,
} from './certificate-eligibility.controller.js';
import { CertificateEligibilityService } from './certificate-eligibility.service.js';
import { AcademicSamplesService } from './academic-samples.service.js';
import { StudentAcademicSamplesController } from './student-academic-samples.controller.js';
@Module({
  imports: [CertificateRequestsModule],
  controllers: [
    CertificateEligibilityController,
    StudentCertificateEligibilityController,
    StudentAcademicSamplesController,
  ],
  providers: [CertificateEligibilityService, AcademicSamplesService],
})
export class CertificateEligibilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(
        CertificateEligibilityController,
        StudentCertificateEligibilityController,
        StudentAcademicSamplesController,
      );
  }
}
