import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import {
  SyntheticCertificatePreparationController,
  SyntheticCertificatesController,
  StudentSyntheticCertificatesController,
} from './synthetic-certificates.controller.js';
import { SyntheticCertificatesService } from './synthetic-certificates.service.js';
@Module({
  controllers: [
    SyntheticCertificatePreparationController,
    SyntheticCertificatesController,
    StudentSyntheticCertificatesController,
  ],
  providers: [SyntheticCertificatesService],
})
export class SyntheticCertificatesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(
        SyntheticCertificatePreparationController,
        SyntheticCertificatesController,
        StudentSyntheticCertificatesController,
      );
  }
}
