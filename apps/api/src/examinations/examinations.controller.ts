import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  type CreateExamination,
  createExaminationSchema,
  type CreateExternalExamApp,
  createExternalExamAppSchema,
  errorResponseSchema,
  type ExaminationDetail,
  examinationDetailSchema,
  type ExaminationList,
  examinationListSchema,
  type ExaminationQuery,
  examinationQuerySchema,
  type ExternalExamApp,
  type ExternalExamAppList,
  externalExamAppListSchema,
  externalExamAppSchema,
  type SetReExamApplications,
  setReExamApplicationsSchema,
  type StudentExaminations,
  studentExaminationsSchema,
  type UpdateExamination,
  updateExaminationSchema,
  type UpdateExternalExamApp,
  updateExternalExamAppSchema,
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
import { ExaminationsService } from './examinations.service.js';

const error = { standardSchema: errorResponseSchema };

/** The university's external examination application (links only — exams happen there). */
@ApiTags('examinations')
@ApiCookieAuth('session')
@Controller('examination-apps')
export class ExaminationAppsController {
  constructor(private readonly service: ExaminationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.examinationsRead)
  @ApiOperation({ summary: 'External examination application links (active and inactive)' })
  @ApiOkResponse({ standardSchema: externalExamAppListSchema })
  list(): Promise<ExternalExamAppList> {
    return this.service.listApps();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.examinationsManage)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Add the examination application (https links only, as provided by the university)',
  })
  @ApiBody({ schema: openApiRequestSchema(createExternalExamAppSchema) })
  @ApiCreatedResponse({ standardSchema: externalExamAppSchema })
  @ApiResponse({ status: 400, description: 'Invalid or non-https URL', ...error })
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createExternalExamAppSchema)) body: CreateExternalExamApp,
  ): Promise<ExternalExamApp> {
    return this.service.createApp(body, auth.user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.examinationsManage)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Edit links/instructions, or activate/deactivate' })
  @ApiBody({ schema: openApiRequestSchema(updateExternalExamAppSchema) })
  @ApiOkResponse({ standardSchema: externalExamAppSchema })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateExternalExamAppSchema)) body: UpdateExternalExamApp,
  ): Promise<ExternalExamApp> {
    return this.service.updateApp(id, body, auth.user.id);
  }
}

/** Examination records tied to a curriculum version and one of its semesters/years. */
@ApiTags('examinations')
@ApiCookieAuth('session')
@Controller('examinations')
export class ExaminationsController {
  constructor(private readonly service: ExaminationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.examinationsRead)
  @ApiOperation({ summary: 'Examination records (newest first by default)' })
  @ApiListQuery(examinationQuerySchema)
  @ApiOkResponse({ standardSchema: examinationListSchema })
  list(
    @Query(new ZodValidationPipe(examinationQuerySchema)) query: ExaminationQuery,
  ): Promise<ExaminationList> {
    return this.service.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.examinationsManage)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Create an examination record (DRAFT) for a curriculum version and period',
    description:
      'The program comes from the curriculum version, which must be ACTIVE or ARCHIVED; the period must exist in it. No schedule or eligibility is created.',
  })
  @ApiBody({ schema: openApiRequestSchema(createExaminationSchema) })
  @ApiCreatedResponse({ standardSchema: examinationDetailSchema })
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createExaminationSchema)) body: CreateExamination,
  ): Promise<ExaminationDetail> {
    return this.service.create(body, auth.user.id);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.examinationsRead)
  @ApiOperation({ summary: 'Examination record with its history' })
  @ApiOkResponse({ standardSchema: examinationDetailSchema })
  detail(@Param('id', UuidParamPipe) id: string): Promise<ExaminationDetail> {
    return this.service.detail(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.examinationsManage)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Edit a DRAFT examination record' })
  @ApiBody({ schema: openApiRequestSchema(updateExaminationSchema) })
  @ApiOkResponse({ standardSchema: examinationDetailSchema })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateExaminationSchema)) body: UpdateExamination,
  ): Promise<ExaminationDetail> {
    return this.service.update(id, body, auth.user.id);
  }

  @Post(':id/open')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.examinationsManage)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'DRAFT → OPEN (visible to students of the curriculum)' })
  @ApiOkResponse({ standardSchema: examinationDetailSchema })
  open(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<ExaminationDetail> {
    return this.service.open(id, auth.user.id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.examinationsManage)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'DRAFT/OPEN → ARCHIVED (also closes re-exam applications)' })
  @ApiOkResponse({ standardSchema: examinationDetailSchema })
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<ExaminationDetail> {
    return this.service.archive(id, auth.user.id);
  }

  @Post(':id/re-exam-applications')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.examinationsManage)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Open or close re-exam applications (OPEN re-examinations only)' })
  @ApiBody({ schema: openApiRequestSchema(setReExamApplicationsSchema) })
  @ApiOkResponse({ standardSchema: examinationDetailSchema })
  setReExamApplications(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(setReExamApplicationsSchema)) body: SetReExamApplications,
  ): Promise<ExaminationDetail> {
    return this.service.setReExamApplications(id, body.open, auth.user.id);
  }
}

@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/examinations')
export class StudentExaminationsController {
  constructor(private readonly service: ExaminationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'The examination application links and, per own registration, curriculum periods and open examination records',
  })
  @ApiOkResponse({ standardSchema: studentExaminationsSchema })
  overview(
    @CurrentStudent() student: StudentContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentExaminations> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.forStudent(student.studentId);
  }
}
