import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  type ApproveReExamApplication,
  approveReExamApplicationSchema,
  type CreateReExamApplication,
  createReExamApplicationSchema,
  type CreateReExamFeeRule,
  createReExamFeeRuleSchema,
  errorResponseSchema,
  type ReExamApplicationDetail,
  reExamApplicationDetailSchema,
  type ReExamApplicationExportQuery,
  reExamApplicationExportQuerySchema,
  type ReExamApplicationList,
  reExamApplicationListSchema,
  type ReExamApplicationQuery,
  reExamApplicationQuerySchema,
  type ReExamFeeRule,
  type ReExamFeeRuleList,
  reExamFeeRuleListSchema,
  reExamFeeRuleSchema,
  type RejectReExamApplication,
  rejectReExamApplicationSchema,
  type StudentReExamApplication,
  type StudentReExamApplicationList,
  studentReExamApplicationListSchema,
  studentReExamApplicationSchema,
  type StudentReExamOptions,
  studentReExamOptionsSchema,
} from '@docversity/validation';
import type { Response } from 'express';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../auth/auth.decorators.js';
import { ApiListQuery } from '../common/api-list-query.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  CurrentStudent,
  type StudentContext,
  StudentRoute,
} from '../student-auth/student-auth.decorators.js';
import { FeeRulesService } from './fee-rules.service.js';
import { ReExamsService } from './re-exams.service.js';

const error = { standardSchema: errorResponseSchema };

@ApiTags('re-exams')
@ApiCookieAuth('session')
@Controller('re-exam-fee-rules')
export class FeeRulesController {
  constructor(private readonly fees: FeeRulesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.reExamApplicationsRead)
  @ApiOperation({ summary: 'Re-exam fee rule versions (newest first)' })
  @ApiOkResponse({ standardSchema: reExamFeeRuleListSchema })
  list(): Promise<ReExamFeeRuleList> {
    return this.fees.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.reExamFeesManage)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary:
      'Create a DRAFT fee rule: explicit scope, ISO currency, amount per attempt (major units)',
    description:
      'Amounts are converted to integer minor units with the currency’s decimal places. Attempts must start at 1 without gaps; attempts without a rate have no approved fee.',
  })
  @ApiBody({ schema: openApiRequestSchema(createReExamFeeRuleSchema) })
  @ApiCreatedResponse({ standardSchema: reExamFeeRuleSchema })
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createReExamFeeRuleSchema)) body: CreateReExamFeeRule,
  ): Promise<ReExamFeeRule> {
    return this.fees.create(body, auth.user.id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.reExamFeesManage)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'DRAFT → ACTIVE (the previous ACTIVE version is retired); frozen afterwards',
  })
  @ApiOkResponse({ standardSchema: reExamFeeRuleSchema })
  activate(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<ReExamFeeRule> {
    return this.fees.activate(id, auth.user.id);
  }

  @Post(':id/retire')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.reExamFeesManage)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Retire a fee rule (without an ACTIVE rule, payment cannot start)' })
  @ApiOkResponse({ standardSchema: reExamFeeRuleSchema })
  retire(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<ReExamFeeRule> {
    return this.fees.retire(id, auth.user.id);
  }
}

@ApiTags('re-exams')
@ApiCookieAuth('session')
@Controller('re-exam-applications')
export class ReExamApplicationsController {
  constructor(private readonly service: ReExamsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.reExamApplicationsRead)
  @ApiOperation({ summary: 'Re-exam applications (newest first by default)' })
  @ApiListQuery(reExamApplicationQuerySchema)
  @ApiOkResponse({ standardSchema: reExamApplicationListSchema })
  list(
    @Query(new ZodValidationPipe(reExamApplicationQuerySchema)) query: ReExamApplicationQuery,
  ): Promise<ReExamApplicationList> {
    return this.service.list(query);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.reExamApplicationsRead)
  @ApiOperation({
    summary: 'CSV of the filtered applications (permitted fields only, max 5000 rows); audited',
  })
  @ApiProduces('text/csv')
  async export(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(reExamApplicationExportQuerySchema))
    query: ReExamApplicationExportQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.service.exportCsv(query, auth.user.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="re-exam-applications-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return csv;
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.reExamApplicationsRead)
  @ApiOperation({ summary: 'Application with attempt, fee snapshot and history' })
  @ApiOkResponse({ standardSchema: reExamApplicationDetailSchema })
  detail(@Param('id', UuidParamPipe) id: string): Promise<ReExamApplicationDetail> {
    return this.service.detail(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.reExamApplicationsDecide)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'SUBMITTED → APPROVED (optional note); never implied by payment' })
  @ApiBody({ schema: openApiRequestSchema(approveReExamApplicationSchema) })
  @ApiOkResponse({ standardSchema: reExamApplicationDetailSchema })
  @ApiResponse({ status: 409, description: 'Already decided or cancelled', ...error })
  approve(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(approveReExamApplicationSchema)) body: ApproveReExamApplication,
  ): Promise<ReExamApplicationDetail> {
    return this.service.approve(id, body, auth.user.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.reExamApplicationsDecide)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'SUBMITTED → REJECTED with a reason (shown to the student)' })
  @ApiBody({ schema: openApiRequestSchema(rejectReExamApplicationSchema) })
  @ApiOkResponse({ standardSchema: reExamApplicationDetailSchema })
  reject(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(rejectReExamApplicationSchema)) body: RejectReExamApplication,
  ): Promise<ReExamApplicationDetail> {
    return this.service.reject(id, body, auth.user.id);
  }
}

/** The signed-in student's own re-exam applications. Identity and fees come from the server. */
@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student')
export class StudentReExamsController {
  constructor(private readonly service: ReExamsService) {}

  @Get('re-exam/options')
  @ApiOperation({
    summary: 'Own registrations with open re-examinations, their subjects, attempt and fee preview',
  })
  @ApiOkResponse({ standardSchema: studentReExamOptionsSchema })
  options(
    @CurrentStudent() student: StudentContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentReExamOptions> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.options(student.studentId);
  }

  @Get('re-exam-applications')
  @ApiOperation({ summary: 'Own re-exam applications with fee, decision and history' })
  @ApiOkResponse({ standardSchema: studentReExamApplicationListSchema })
  list(
    @CurrentStudent() student: StudentContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentReExamApplicationList> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.ownList(student.studentId);
  }

  @Post('re-exam-applications')
  @ApiSecurity('csrf')
  @ApiOperation({
    summary:
      'Apply for a re-examination of one subject (attempt and fee are derived by the server)',
  })
  @ApiBody({ schema: openApiRequestSchema(createReExamApplicationSchema) })
  @ApiCreatedResponse({ standardSchema: studentReExamApplicationSchema })
  @ApiResponse({ status: 409, description: 'Already applied for this subject', ...error })
  submit(
    @CurrentStudent() student: StudentContext,
    @Body(new ZodValidationPipe(createReExamApplicationSchema)) body: CreateReExamApplication,
  ): Promise<StudentReExamApplication> {
    return this.service.submit(student.studentId, student.accountId, body);
  }

  @Get('re-exam-applications/:id')
  @ApiOperation({ summary: 'One own application (others are 404)' })
  @ApiOkResponse({ standardSchema: studentReExamApplicationSchema })
  detail(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentReExamApplication> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.ownDetail(student.studentId, id);
  }

  @Post('re-exam-applications/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Cancel an own application that is still awaiting a decision' })
  @ApiOkResponse({ standardSchema: studentReExamApplicationSchema })
  cancel(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<StudentReExamApplication> {
    return this.service.cancel(student.studentId, student.accountId, id);
  }

  @Post('re-exam-applications/:id/fee')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Re-check a fee that was not configured at submission (attempt number never changes)',
  })
  @ApiOkResponse({ standardSchema: studentReExamApplicationSchema })
  reassess(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<StudentReExamApplication> {
    return this.service.reassessFee(student.studentId, id);
  }
}
