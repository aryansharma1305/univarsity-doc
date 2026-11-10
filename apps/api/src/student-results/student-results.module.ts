import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { StudentResultsController } from './student-results.controller.js';
import { ReleaseWorkflowsModule } from '../release-workflows/release-workflows.module.js';

@Module({ imports: [ReleaseWorkflowsModule], controllers: [StudentResultsController] })
export class StudentResultsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_req: Request, res: Response, next: NextFunction) => {
        // Also covers guard/validation failures, before a controller can run.
        res.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(StudentResultsController);
  }
}
