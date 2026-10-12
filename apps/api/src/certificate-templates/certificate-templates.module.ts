import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { CertificateTemplatesController } from './certificate-templates.controller.js';
import { CertificateTemplatesService } from './certificate-templates.service.js';
@Module({ controllers: [CertificateTemplatesController], providers: [CertificateTemplatesService] })
export class CertificateTemplatesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(CertificateTemplatesController);
  }
}
