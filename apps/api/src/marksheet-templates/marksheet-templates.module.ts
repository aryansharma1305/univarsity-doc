import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { MarksheetTemplatesController } from './marksheet-templates.controller.js';
import { MarksheetTemplatesService } from './marksheet-templates.service.js';
@Module({ controllers: [MarksheetTemplatesController], providers: [MarksheetTemplatesService] })
export class MarksheetTemplatesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(MarksheetTemplatesController);
  }
}
