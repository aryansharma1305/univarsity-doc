import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import {
  CertificateRequestsController,
  StudentCertificateRequestsController,
} from './certificate-requests.controller.js';
import { CertificateRequestsService } from './certificate-requests.service.js';
import { CertificatePoliciesService } from './certificate-policies.service.js';
@Module({
  controllers: [CertificateRequestsController, StudentCertificateRequestsController],
  providers: [CertificateRequestsService, CertificatePoliciesService],
})
export class CertificateRequestsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(CertificateRequestsController, StudentCertificateRequestsController);
  }
}
