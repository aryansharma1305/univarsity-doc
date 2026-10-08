import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  type AcademicSession,
  type AcademicSessionList,
  type AcademicSessionQuery,
  academicSessionListSchema,
  academicSessionQuerySchema,
  academicSessionSchema,
  type ActivityList,
  activityListSchema,
  type CreateAcademicSession,
  type CreateDepartment,
  type CreateProgram,
  type CreateRegistration,
  type CreateStudent,
  createAcademicSessionSchema,
  createDepartmentSchema,
  createProgramSchema,
  createRegistrationSchema,
  createStudentSchema,
  type Dashboard,
  dashboardSchema,
  type Department,
  type DepartmentList,
  type DepartmentQuery,
  departmentListSchema,
  departmentQuerySchema,
  departmentSchema,
  errorResponseSchema,
  type Program,
  type ProgramList,
  type ProgramQuery,
  programListSchema,
  programQuerySchema,
  programSchema,
  type Registration,
  type RegistrationList,
  type RegistrationQuery,
  registrationListSchema,
  registrationQuerySchema,
  registrationSchema,
  type StudentDetail,
  type StudentList,
  type StudentQuery,
  studentDetailSchema,
  studentListSchema,
  studentQuerySchema,
  type UpdateAcademicSession,
  type UpdateDepartment,
  type UpdateProgram,
  type UpdateRegistration,
  type UpdateStudent,
  updateAcademicSessionSchema,
  updateDepartmentSchema,
  updateProgramSchema,
  updateRegistrationSchema,
  updateStudentSchema,
} from '@docversity/validation';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../auth/auth.decorators.js';
import { ApiListQuery } from '../common/api-list-query.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AcademicSessionsService } from './academic-sessions.service.js';
import { DashboardService } from './dashboard.service.js';
import { DepartmentsService } from './departments.service.js';
import { ProgramsService } from './programs.service.js';
import { RegistrationsService } from './registrations.service.js';
import { StudentsService } from './students.service.js';

const error = { standardSchema: errorResponseSchema };
const MUTATION_ERRORS = [
  ApiResponse({ status: 400, description: 'Validation failed (field details included)', ...error }),
  ApiResponse({ status: 403, description: 'Missing permission or CSRF token', ...error }),
  ApiResponse({
    status: 409,
    description: 'Conflicts with an existing record (e.g. duplicate code)',
    ...error,
  }),
];

function MutationDocs(): MethodDecorator {
  return (target, key, descriptor) => {
    ApiSecurity('csrf')(target, key, descriptor);
    for (const decorator of MUTATION_ERRORS) decorator(target, key, descriptor);
  };
}

// ----------------------------------------------------------------------------------------------
@ApiTags('departments')
@ApiCookieAuth('session')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.departmentsRead)
  @ApiOperation({ summary: 'List departments' })
  @ApiListQuery(departmentQuerySchema)
  @ApiOkResponse({ standardSchema: departmentListSchema })
  list(
    @Query(new ZodValidationPipe(departmentQuerySchema)) query: DepartmentQuery,
  ): Promise<DepartmentList> {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.departmentsRead)
  @ApiOkResponse({ standardSchema: departmentSchema })
  get(@Param('id', UuidParamPipe) id: string): Promise<Department> {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.departmentsWrite)
  @ApiOperation({ summary: 'Create a department' })
  @ApiBody({ schema: openApiRequestSchema(createDepartmentSchema) })
  @ApiCreatedResponse({ standardSchema: departmentSchema })
  @MutationDocs()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createDepartmentSchema)) body: CreateDepartment,
  ): Promise<Department> {
    return this.service.create(body, auth.user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.departmentsWrite)
  @ApiOperation({ summary: 'Update a department (including activate/deactivate via status)' })
  @ApiBody({ schema: openApiRequestSchema(updateDepartmentSchema) })
  @ApiOkResponse({ standardSchema: departmentSchema })
  @MutationDocs()
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateDepartmentSchema)) body: UpdateDepartment,
  ): Promise<Department> {
    return this.service.update(id, body, auth.user.id);
  }
}

// ----------------------------------------------------------------------------------------------
@ApiTags('programs')
@ApiCookieAuth('session')
@Controller('programs')
export class ProgramsController {
  constructor(private readonly service: ProgramsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.programsRead)
  @ApiOperation({ summary: 'List programs' })
  @ApiListQuery(programQuerySchema)
  @ApiOkResponse({ standardSchema: programListSchema })
  list(
    @Query(new ZodValidationPipe(programQuerySchema)) query: ProgramQuery,
  ): Promise<ProgramList> {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.programsRead)
  @ApiOkResponse({ standardSchema: programSchema })
  get(@Param('id', UuidParamPipe) id: string): Promise<Program> {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.programsWrite)
  @ApiOperation({ summary: 'Create a program' })
  @ApiBody({ schema: openApiRequestSchema(createProgramSchema) })
  @ApiCreatedResponse({ standardSchema: programSchema })
  @MutationDocs()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createProgramSchema)) body: CreateProgram,
  ): Promise<Program> {
    return this.service.create(body, auth.user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.programsWrite)
  @ApiOperation({ summary: 'Update a program (including activate/deactivate via status)' })
  @ApiBody({ schema: openApiRequestSchema(updateProgramSchema) })
  @ApiOkResponse({ standardSchema: programSchema })
  @MutationDocs()
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateProgramSchema)) body: UpdateProgram,
  ): Promise<Program> {
    return this.service.update(id, body, auth.user.id);
  }
}

// ----------------------------------------------------------------------------------------------
@ApiTags('academic-sessions')
@ApiCookieAuth('session')
@Controller('academic-sessions')
export class AcademicSessionsController {
  constructor(private readonly service: AcademicSessionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.academicSessionsRead)
  @ApiOperation({ summary: 'List academic sessions' })
  @ApiListQuery(academicSessionQuerySchema)
  @ApiOkResponse({ standardSchema: academicSessionListSchema })
  list(
    @Query(new ZodValidationPipe(academicSessionQuerySchema)) query: AcademicSessionQuery,
  ): Promise<AcademicSessionList> {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.academicSessionsRead)
  @ApiOkResponse({ standardSchema: academicSessionSchema })
  get(@Param('id', UuidParamPipe) id: string): Promise<AcademicSession> {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.academicSessionsWrite)
  @ApiOperation({ summary: 'Create an academic session' })
  @ApiBody({ schema: openApiRequestSchema(createAcademicSessionSchema) })
  @ApiCreatedResponse({ standardSchema: academicSessionSchema })
  @MutationDocs()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createAcademicSessionSchema)) body: CreateAcademicSession,
  ): Promise<AcademicSession> {
    return this.service.create(body, auth.user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.academicSessionsWrite)
  @ApiOperation({
    summary: 'Update an academic session (dates are re-checked against stored values)',
  })
  @ApiBody({ schema: openApiRequestSchema(updateAcademicSessionSchema) })
  @ApiOkResponse({ standardSchema: academicSessionSchema })
  @MutationDocs()
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateAcademicSessionSchema)) body: UpdateAcademicSession,
  ): Promise<AcademicSession> {
    return this.service.update(id, body, auth.user.id);
  }
}

// ----------------------------------------------------------------------------------------------
@ApiTags('students')
@ApiCookieAuth('session')
@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.studentsRead)
  @ApiOperation({
    summary: 'List students',
    description:
      'Search matches full name or registration number. Filters apply to the student’s registrations.',
  })
  @ApiListQuery(studentQuerySchema)
  @ApiOkResponse({ standardSchema: studentListSchema })
  list(
    @Query(new ZodValidationPipe(studentQuerySchema)) query: StudentQuery,
  ): Promise<StudentList> {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.studentsRead)
  @ApiOkResponse({ standardSchema: studentDetailSchema })
  get(@Param('id', UuidParamPipe) id: string): Promise<StudentDetail> {
    return this.service.get(id);
  }

  @Get(':id/activity')
  @RequirePermissions(PERMISSIONS.studentsRead)
  @ApiOperation({ summary: 'Safe audit summaries for the student and their registrations' })
  @ApiOkResponse({ standardSchema: activityListSchema })
  async activity(@Param('id', UuidParamPipe) id: string): Promise<ActivityList> {
    return { data: await this.service.activity(id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.studentsWrite, PERMISSIONS.registrationsWrite)
  @ApiOperation({
    summary: 'Create a student with their first registration',
    description: 'Both records are created in one transaction; on any failure neither is kept.',
  })
  @ApiBody({ schema: openApiRequestSchema(createStudentSchema) })
  @ApiCreatedResponse({ standardSchema: studentDetailSchema })
  @MutationDocs()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createStudentSchema)) body: CreateStudent,
  ): Promise<StudentDetail> {
    return this.service.create(body, auth.user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.studentsWrite)
  @ApiOperation({ summary: 'Update personal details' })
  @ApiBody({ schema: openApiRequestSchema(updateStudentSchema) })
  @ApiOkResponse({ standardSchema: studentDetailSchema })
  @MutationDocs()
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateStudentSchema)) body: UpdateStudent,
  ): Promise<StudentDetail> {
    return this.service.update(id, body, auth.user.id);
  }
}

// ----------------------------------------------------------------------------------------------
@ApiTags('registrations')
@ApiCookieAuth('session')
@Controller('registrations')
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.registrationsRead)
  @ApiOperation({ summary: 'List student registrations' })
  @ApiListQuery(registrationQuerySchema)
  @ApiOkResponse({ standardSchema: registrationListSchema })
  list(
    @Query(new ZodValidationPipe(registrationQuerySchema)) query: RegistrationQuery,
  ): Promise<RegistrationList> {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.registrationsRead)
  @ApiOkResponse({ standardSchema: registrationSchema })
  get(@Param('id', UuidParamPipe) id: string): Promise<Registration> {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.registrationsWrite)
  @ApiOperation({ summary: 'Add a registration to an existing student' })
  @ApiBody({ schema: openApiRequestSchema(createRegistrationSchema) })
  @ApiCreatedResponse({ standardSchema: registrationSchema })
  @MutationDocs()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createRegistrationSchema)) body: CreateRegistration,
  ): Promise<Registration> {
    return this.service.create(body, auth.user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.registrationsWrite)
  @ApiOperation({ summary: 'Update a registration (including status)' })
  @ApiBody({ schema: openApiRequestSchema(updateRegistrationSchema) })
  @ApiOkResponse({ standardSchema: registrationSchema })
  @MutationDocs()
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateRegistrationSchema)) body: UpdateRegistration,
  ): Promise<Registration> {
    return this.service.update(id, body, auth.user.id);
  }
}

// ----------------------------------------------------------------------------------------------
@ApiTags('dashboard')
@ApiCookieAuth('session')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Admin dashboard counts',
    description: 'Real counts only. `recentActivity` is included only for users with audit.read.',
  })
  @ApiOkResponse({ standardSchema: dashboardSchema })
  get(@CurrentAuth() auth: AuthContext): Promise<Dashboard> {
    return this.service.get(auth.user.permissions.has(PERMISSIONS.auditRead));
  }
}
