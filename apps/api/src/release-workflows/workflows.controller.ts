import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@docversity/types';
import {
  legacyRecoverySchema,
  type LegacyRecovery,
  prepareReleaseSchema,
  workflowCommandSchema,
  syntheticLookupSchema,
  submitRetotalingSchema,
  legacyDryRunSchema,
  sandboxOrderSchema,
  sandboxCallbackSchema,
  sandboxRefundSchema,
  type PrepareRelease,
  type WorkflowCommand,
  type SubmitRetotaling,
  type LegacyDryRun,
  type SandboxOrder,
  type SandboxCallback,
  type SandboxRefund,
} from '@docversity/validation';
import {
  CurrentAuth,
  Public,
  RequirePermissions,
  type AuthContext,
} from '../auth/auth.decorators.js';
import {
  CurrentStudent,
  StudentRoute,
  type StudentContext,
} from '../student-auth/student-auth.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { Errors } from '../common/app-error.js';
import { ReleasesService } from './releases.service.js';
import { VerificationAdaptersService } from './verification-adapters.service.js';
import { RetotalingService } from './retotaling.service.js';
import { LegacyMigrationService } from './legacy-migration.service.js';
import { SandboxGatewayService } from './sandbox-gateway.service.js';

@ApiTags('synthetic-workflows')
@ApiCookieAuth('session')
@RequirePermissions(PERMISSIONS.syntheticWorkflowsManage)
@Controller('synthetic-workflows')
export class WorkflowsController {
  constructor(
    private readonly releases: ReleasesService,
    private readonly verification: VerificationAdaptersService,
    private readonly retotaling: RetotalingService,
    private readonly legacy: LegacyMigrationService,
    private readonly gateway: SandboxGatewayService,
  ) {}
  @Post('releases')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(prepareReleaseSchema) })
  prepare(
    @CurrentAuth() a: AuthContext,
    @Body(new ZodValidationPipe(prepareReleaseSchema)) b: PrepareRelease,
  ) {
    return this.releases.prepare(b, a.user.id);
  }
  @Post('releases/:id/:action')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(workflowCommandSchema) })
  transition(
    @CurrentAuth() a: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('action', new ZodValidationPipe(z.enum(['APPROVE', 'PUBLISH', 'WITHDRAW'])))
    action: 'APPROVE' | 'PUBLISH' | 'WITHDRAW',
    @Body(new ZodValidationPipe(workflowCommandSchema)) b: WorkflowCommand,
  ) {
    return this.releases.transition(id, action, b, a.user.id);
  }
  @Post('verify')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(syntheticLookupSchema) })
  verify(
    @CurrentAuth() a: AuthContext,
    @Body(new ZodValidationPipe(syntheticLookupSchema)) b: z.infer<typeof syntheticLookupSchema>,
  ) {
    return this.verification.lookup(b.service, b.reference, a.user.id);
  }
  @Get('retotaling') list() {
    return this.retotaling.list();
  }
  @Post('retotaling/:id/:action')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(workflowCommandSchema) })
  retotal(
    @CurrentAuth() a: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('action', new ZodValidationPipe(z.enum(['REQUEST_INFORMATION', 'CLOSE'])))
    action: 'REQUEST_INFORMATION' | 'CLOSE',
    @Body(new ZodValidationPipe(workflowCommandSchema)) b: WorkflowCommand,
  ) {
    return this.retotaling.transition(id, action, b, { userId: a.user.id });
  }
  @Post('migration/dry-run')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(legacyDryRunSchema) })
  dryRun(
    @CurrentAuth() a: AuthContext,
    @Body(new ZodValidationPipe(legacyDryRunSchema)) b: LegacyDryRun,
  ) {
    return this.legacy.prepare(b, a.user.id);
  }
  @Post('migration/:id/recover')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(legacyRecoverySchema) })
  recover(
    @CurrentAuth() a: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(legacyRecoverySchema)) b: LegacyRecovery,
  ) {
    return this.legacy.recover(id, b, a.user.id);
  }
  @Post('gateway/:id/refund')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(sandboxRefundSchema) })
  refund(
    @CurrentAuth() a: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(sandboxRefundSchema)) b: SandboxRefund,
  ) {
    return this.gateway.refund(id, b, a.user.id);
  }
  @Get('gateway/:id/reconcile') reconcile(@Param('id', UuidParamPipe) id: string) {
    return this.gateway.reconcile(id);
  }
}
@ApiTags('synthetic-workflows')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student')
export class StudentWorkflowsController {
  constructor(
    private readonly retotaling: RetotalingService,
    private readonly verification: VerificationAdaptersService,
    private readonly gateway: SandboxGatewayService,
  ) {}
  @Get('admission-letters') admissions(@CurrentStudent() s: StudentContext) {
    return this.verification.admissions(s.studentId);
  }
  @Get('admission-letters/:id') async admission(
    @CurrentStudent() s: StudentContext,
    @Param('id', UuidParamPipe) id: string,
  ) {
    const r = (await this.verification.admissions(s.studentId, id))[0];
    if (!r) throw Errors.notFound();
    return r;
  }
  @Get('retotaling') list(@CurrentStudent() s: StudentContext) {
    return this.retotaling.list(s.studentId);
  }
  @Post('retotaling')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(submitRetotalingSchema) })
  submit(
    @CurrentStudent() s: StudentContext,
    @Body(new ZodValidationPipe(submitRetotalingSchema)) b: SubmitRetotaling,
  ) {
    return this.retotaling.submit(s.studentId, s.accountId, b);
  }
  @Post('retotaling/:id/:action')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(workflowCommandSchema) })
  transition(
    @CurrentStudent() s: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('action', new ZodValidationPipe(z.enum(['RESPOND', 'CANCEL'])))
    action: 'RESPOND' | 'CANCEL',
    @Body(new ZodValidationPipe(workflowCommandSchema)) b: WorkflowCommand,
  ) {
    return this.retotaling.transition(id, action, b, {
      studentId: s.studentId,
      accountId: s.accountId,
    });
  }
  @Post('sandbox-gateway/orders')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(sandboxOrderSchema) })
  order(
    @CurrentStudent() s: StudentContext,
    @Body(new ZodValidationPipe(sandboxOrderSchema)) b: SandboxOrder,
  ) {
    return this.gateway.create(s.studentId, b);
  }
}
@ApiTags('synthetic-workflows')
@Controller('sandbox-gateway')
export class SandboxCallbackController {
  constructor(private readonly gateway: SandboxGatewayService) {}
  @Post('callback')
  @HttpCode(200)
  @Public()
  @ApiBody({ schema: openApiRequestSchema(sandboxCallbackSchema) })
  callback(
    @Body(new ZodValidationPipe(sandboxCallbackSchema)) b: SandboxCallback,
    @Req() req: Request,
  ) {
    return this.gateway.callback(b, req.ip ?? 'unknown');
  }
}
