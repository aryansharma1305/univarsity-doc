import { PublicVerificationModule } from '../public-verification/public-verification.module.js';
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { ReExamsModule } from '../re-exams/re-exams.module.js';
import { WorkflowPolicyService } from './workflow-policy.service.js';
import { ReleasesService } from './releases.service.js';
import { VerificationAdaptersService } from './verification-adapters.service.js';
import { RetotalingService } from './retotaling.service.js';
import { LegacyMigrationService } from './legacy-migration.service.js';
import { SandboxGatewayService } from './sandbox-gateway.service.js';
import {
  WorkflowsController,
  StudentWorkflowsController,
  SandboxCallbackController,
} from './workflows.controller.js';
@Module({
  imports: [ReExamsModule, PublicVerificationModule],
  controllers: [WorkflowsController, StudentWorkflowsController, SandboxCallbackController],
  providers: [
    WorkflowPolicyService,
    ReleasesService,
    VerificationAdaptersService,
    RetotalingService,
    LegacyMigrationService,
    SandboxGatewayService,
  ],
  exports: [ReleasesService, WorkflowPolicyService],
})
export class ReleaseWorkflowsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(WorkflowsController, StudentWorkflowsController, SandboxCallbackController);
  }
}
