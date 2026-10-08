import {
  Body,
  Controller,
  Delete,
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
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  type AddCurriculumSubject,
  addCurriculumSubjectSchema,
  type AssignCurriculum,
  type AssignCurriculumResult,
  assignCurriculumResultSchema,
  assignCurriculumSchema,
  type CreateCurriculum,
  createCurriculumSchema,
  type CreateSubject,
  createSubjectSchema,
  type CurriculumDetail,
  curriculumDetailSchema,
  type CurriculumList,
  curriculumListSchema,
  type CurriculumRegistrationList,
  curriculumRegistrationListSchema,
  type CurriculumRegistrationQuery,
  curriculumRegistrationQuerySchema,
  errorResponseSchema,
  type ReorderCurriculumSubjects,
  reorderCurriculumSubjectsSchema,
  type StudentCurriculum,
  studentCurriculumSchema,
  type Subject,
  type SubjectList,
  type SubjectQuery,
  subjectListSchema,
  subjectQuerySchema,
  subjectSchema,
  type UpdateCurriculum,
  type UpdateCurriculumSubject,
  type UpdateSubject,
  updateCurriculumSchema,
  updateCurriculumSubjectSchema,
  updateSubjectSchema,
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
import { MutationDocs } from './academic.controllers.js';
import { CurriculaService } from './curricula.service.js';
import { SubjectsService } from './subjects.service.js';

const error = { standardSchema: errorResponseSchema };
const NOT_EDITABLE = {
  status: 409,
  description: 'The curriculum is not a draft (CURRICULUM_NOT_EDITABLE) or a rule is violated',
  ...error,
};

@ApiTags('subjects')
@ApiCookieAuth('session')
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly service: SubjectsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.subjectsRead)
  @ApiOperation({ summary: 'Subject catalogue' })
  @ApiListQuery(subjectQuerySchema)
  @ApiOkResponse({ standardSchema: subjectListSchema })
  list(
    @Query(new ZodValidationPipe(subjectQuerySchema)) query: SubjectQuery,
  ): Promise<SubjectList> {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.subjectsRead)
  @ApiOkResponse({ standardSchema: subjectSchema })
  get(@Param('id', UuidParamPipe) id: string): Promise<Subject> {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.subjectsWrite)
  @ApiOperation({ summary: 'Add a subject to the catalogue (codes are unique, case-insensitive)' })
  @ApiBody({ schema: openApiRequestSchema(createSubjectSchema) })
  @ApiCreatedResponse({ standardSchema: subjectSchema })
  @MutationDocs()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createSubjectSchema)) body: CreateSubject,
  ): Promise<Subject> {
    return this.service.create(body, auth.user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.subjectsWrite)
  @ApiOperation({
    summary: 'Update catalogue details or status (assignments keep their own rules)',
  })
  @ApiBody({ schema: openApiRequestSchema(updateSubjectSchema) })
  @ApiOkResponse({ standardSchema: subjectSchema })
  @MutationDocs()
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateSubjectSchema)) body: UpdateSubject,
  ): Promise<Subject> {
    return this.service.update(id, body, auth.user.id);
  }
}

/** Curriculum versions of one program. */
@ApiTags('curricula')
@ApiCookieAuth('session')
@Controller('programs')
export class ProgramCurriculaController {
  constructor(private readonly service: CurriculaService) {}

  @Get(':id/curricula')
  @RequirePermissions(PERMISSIONS.curriculaRead)
  @ApiOperation({ summary: 'Curriculum versions of a program (newest first)' })
  @ApiOkResponse({ standardSchema: curriculumListSchema })
  list(@Param('id', UuidParamPipe) programId: string): Promise<CurriculumList> {
    return this.service.listForProgram(programId);
  }

  @Post(':id/curricula')
  @RequirePermissions(PERMISSIONS.curriculaWrite)
  @ApiOperation({
    summary: 'Create a DRAFT curriculum version (optionally copying another version’s subjects)',
  })
  @ApiBody({ schema: openApiRequestSchema(createCurriculumSchema) })
  @ApiCreatedResponse({ standardSchema: curriculumDetailSchema })
  @MutationDocs()
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) programId: string,
    @Body(new ZodValidationPipe(createCurriculumSchema)) body: CreateCurriculum,
  ): Promise<CurriculumDetail> {
    return this.service.create(programId, body, auth.user.id);
  }
}

@ApiTags('curricula')
@ApiCookieAuth('session')
@Controller('curricula')
export class CurriculaController {
  constructor(private readonly service: CurriculaService) {}

  @Get(':id')
  @RequirePermissions(PERMISSIONS.curriculaRead)
  @ApiOperation({ summary: 'A curriculum version with its semesters/years and subjects' })
  @ApiOkResponse({ standardSchema: curriculumDetailSchema })
  get(@Param('id', UuidParamPipe) id: string): Promise<CurriculumDetail> {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.curriculaWrite)
  @ApiOperation({
    summary: 'Edit a DRAFT version (an ACTIVE version accepts only effectiveTo)',
  })
  @ApiBody({ schema: openApiRequestSchema(updateCurriculumSchema) })
  @ApiOkResponse({ standardSchema: curriculumDetailSchema })
  @ApiResponse(NOT_EDITABLE)
  @MutationDocs()
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateCurriculumSchema)) body: UpdateCurriculum,
  ): Promise<CurriculumDetail> {
    return this.service.update(id, body, auth.user.id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.curriculaActivate)
  @ApiOperation({
    summary: 'Activate a DRAFT version (read-only afterwards; no overlapping active periods)',
  })
  @ApiOkResponse({ standardSchema: curriculumDetailSchema })
  @ApiResponse(NOT_EDITABLE)
  @MutationDocs()
  activate(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<CurriculumDetail> {
    return this.service.activate(id, auth.user.id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.curriculaArchive)
  @ApiOperation({
    summary: 'Archive a version (no new assignments; existing assignments and history stay)',
  })
  @ApiOkResponse({ standardSchema: curriculumDetailSchema })
  @ApiResponse(NOT_EDITABLE)
  @MutationDocs()
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<CurriculumDetail> {
    return this.service.archive(id, auth.user.id);
  }

  @Post(':id/subjects')
  @RequirePermissions(PERMISSIONS.curriculaWrite)
  @ApiOperation({ summary: 'Add a catalogue subject to a semester/year of a DRAFT version' })
  @ApiBody({ schema: openApiRequestSchema(addCurriculumSubjectSchema) })
  @ApiCreatedResponse({ standardSchema: curriculumDetailSchema })
  @ApiResponse(NOT_EDITABLE)
  @MutationDocs()
  addSubject(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(addCurriculumSubjectSchema)) body: AddCurriculumSubject,
  ): Promise<CurriculumDetail> {
    return this.service.addSubject(id, body, auth.user.id);
  }

  @Patch(':id/subjects/:assignmentId')
  @RequirePermissions(PERMISSIONS.curriculaWrite)
  @ApiOperation({ summary: 'Edit a subject assignment of a DRAFT version' })
  @ApiBody({ schema: openApiRequestSchema(updateCurriculumSubjectSchema) })
  @ApiOkResponse({ standardSchema: curriculumDetailSchema })
  @ApiResponse(NOT_EDITABLE)
  @MutationDocs()
  updateSubject(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('assignmentId', UuidParamPipe) assignmentId: string,
    @Body(new ZodValidationPipe(updateCurriculumSubjectSchema)) body: UpdateCurriculumSubject,
  ): Promise<CurriculumDetail> {
    return this.service.updateSubject(id, assignmentId, body, auth.user.id);
  }

  @Delete(':id/subjects/:assignmentId')
  @RequirePermissions(PERMISSIONS.curriculaWrite)
  @ApiOperation({ summary: 'Remove a subject from a DRAFT version' })
  @ApiOkResponse({ standardSchema: curriculumDetailSchema })
  @ApiResponse(NOT_EDITABLE)
  @MutationDocs()
  removeSubject(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('assignmentId', UuidParamPipe) assignmentId: string,
  ): Promise<CurriculumDetail> {
    return this.service.removeSubject(id, assignmentId, auth.user.id);
  }

  @Post(':id/subjects/reorder')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.curriculaWrite)
  @ApiOperation({ summary: 'Reorder the subjects of one semester/year of a DRAFT version' })
  @ApiBody({ schema: openApiRequestSchema(reorderCurriculumSubjectsSchema) })
  @ApiOkResponse({ standardSchema: curriculumDetailSchema })
  @ApiResponse(NOT_EDITABLE)
  @MutationDocs()
  reorder(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(reorderCurriculumSubjectsSchema)) body: ReorderCurriculumSubjects,
  ): Promise<CurriculumDetail> {
    return this.service.reorder(id, body, auth.user.id);
  }

  @Get(':id/registrations')
  @RequirePermissions(PERMISSIONS.curriculaRead, PERMISSIONS.registrationsRead)
  @ApiOperation({ summary: 'Registrations of the program with their curriculum assignment' })
  @ApiListQuery(curriculumRegistrationQuerySchema)
  @ApiOkResponse({ standardSchema: curriculumRegistrationListSchema })
  registrations(
    @Param('id', UuidParamPipe) id: string,
    @Query(new ZodValidationPipe(curriculumRegistrationQuerySchema))
    query: CurriculumRegistrationQuery,
  ): Promise<CurriculumRegistrationList> {
    return this.service.registrations(id, query);
  }

  @Post(':id/registrations')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.studentCurriculaAssign)
  @ApiOperation({
    summary: 'Assign registrations of the program to this ACTIVE version',
    description:
      'Explicit staff action. Registrations already following another version are skipped unless replaceExisting is true; registrations with results are never moved.',
  })
  @ApiBody({ schema: openApiRequestSchema(assignCurriculumSchema) })
  @ApiOkResponse({ standardSchema: assignCurriculumResultSchema })
  @ApiResponse(NOT_EDITABLE)
  @MutationDocs()
  assign(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(assignCurriculumSchema)) body: AssignCurriculum,
  ): Promise<AssignCurriculumResult> {
    return this.service.assign(id, body, auth.user.id);
  }
}

/** The signed-in student's own curricula (read-only). */
@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student')
export class StudentCurriculumController {
  constructor(private readonly service: CurriculaService) {}

  @Get('curriculum')
  @ApiOperation({
    summary: 'The curriculum assigned to each of the signed-in student’s registrations',
  })
  @ApiOkResponse({ standardSchema: studentCurriculumSchema })
  curriculum(
    @CurrentStudent() student: StudentContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentCurriculum> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.forStudent(student.studentId);
  }
}
