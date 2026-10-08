import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  type PipeTransform,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
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
  type CommitImport,
  commitImportSchema,
  errorResponseSchema,
  type ImportCreatorList,
  importCreatorListSchema,
  type ImportJob,
  type ImportJobList,
  importJobListSchema,
  type ImportJobQuery,
  importJobQuerySchema,
  importJobSchema,
  type ImportMapping,
  importMappingSchema,
  type ImportRowDetail,
  importRowDetailSchema,
  type ImportRowList,
  importRowListSchema,
  type ImportRowQuery,
  importRowQuerySchema,
  importTypeSchema,
} from '@docversity/validation';
import type { Response } from 'express';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../auth/auth.decorators.js';
import { ApiListQuery } from '../common/api-list-query.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { Errors } from '../common/app-error.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type DownloadFile, ImportsService, XLSX_CONTENT_TYPE } from './imports.service.js';
import { type UploadRequest, WorkbookUploadInterceptor } from './upload.interceptor.js';

const error = { standardSchema: errorResponseSchema };

/** Spreadsheet row numbers in routes: positive integers; anything else is "not found". */
class RowNumberPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^[1-9]\d{0,6}$/.test(value)) throw Errors.notFound();
    return Number(value);
  }
}
const STEP_ERRORS = [
  ApiResponse({ status: 400, description: 'Validation failed (field details included)', ...error }),
  ApiResponse({ status: 403, description: 'Missing permission or CSRF token', ...error }),
  ApiResponse({ status: 409, description: 'Not allowed in the import’s current state', ...error }),
  ApiResponse({
    status: 503,
    description: 'Background queue unavailable (import kept, retryable)',
    ...error,
  }),
];

function StepDocs(): MethodDecorator {
  return (target, key, descriptor) => {
    ApiSecurity('csrf')(target, key, descriptor);
    for (const decorator of STEP_ERRORS) decorator(target, key, descriptor);
  };
}

/** Sends a generated file as a private, non-cacheable download with a safe, fixed filename. */
function download(response: Response, file: DownloadFile): StreamableFile {
  response.setHeader('Cache-Control', 'no-store');
  return new StreamableFile(Buffer.from(file.bytes), {
    type: XLSX_CONTENT_TYPE,
    disposition: `attachment; filename="${file.filename}"`,
    length: file.bytes.byteLength,
  });
}

@ApiTags('imports')
@ApiCookieAuth('session')
@Controller('imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Get('templates/students')
  @RequirePermissions(PERMISSIONS.importsStudentsRun)
  @ApiOperation({ summary: 'Download the student import template (.xlsx)' })
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOkResponse({ description: 'XLSX workbook (Instructions + Students sheets)' })
  async template(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return download(response, await this.service.studentTemplate());
  }

  @Get()
  @RequirePermissions(PERMISSIONS.importsRead)
  @ApiOperation({ summary: 'Import history' })
  @ApiListQuery(importJobQuerySchema)
  @ApiOkResponse({ standardSchema: importJobListSchema })
  list(
    @Query(new ZodValidationPipe(importJobQuerySchema)) query: ImportJobQuery,
  ): Promise<ImportJobList> {
    return this.service.list(query);
  }

  @Get('creators')
  @RequirePermissions(PERMISSIONS.importsRead)
  @ApiOperation({ summary: 'Staff members who created imports (history filter options)' })
  @ApiOkResponse({ standardSchema: importCreatorListSchema })
  creators(): Promise<ImportCreatorList> {
    return this.service.creators();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.importsStudentsRun)
  @UseInterceptors(WorkbookUploadInterceptor)
  @ApiOperation({
    summary: 'Create a student import by uploading an .xlsx workbook',
    description:
      'Stores the file privately under a generated key, records the import (UPLOADED) and queues the worker to read the workbook (→ MAPPING).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'file'],
      properties: {
        type: { type: 'string', enum: ['STUDENTS'] },
        file: { type: 'string', format: 'binary', description: '.xlsx workbook' },
      },
    },
  })
  @ApiCreatedResponse({ standardSchema: importJobSchema })
  @ApiResponse({ status: 413, description: 'File larger than IMPORT_MAX_FILE_MB', ...error })
  @StepDocs()
  create(@CurrentAuth() auth: AuthContext, @Req() request: UploadRequest): Promise<ImportJob> {
    const body = request.body as Record<string, unknown> | undefined;
    const type = new ZodValidationPipe(importTypeSchema.default('STUDENTS')).transform(body?.type);
    return this.service.create(type, request.file, auth.user.id);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.importsRead)
  @ApiOperation({ summary: 'Import status, worksheets, mapping, counts and allowed actions' })
  @ApiOkResponse({ standardSchema: importJobSchema })
  get(@Param('id', UuidParamPipe) id: string): Promise<ImportJob> {
    return this.service.get(id);
  }

  @Post(':id/mapping')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.importsStudentsRun)
  @ApiOperation({
    summary:
      'Save the worksheet + column mapping (MAPPING; from VALIDATED it discards the validation)',
  })
  @ApiBody({ schema: openApiRequestSchema(importMappingSchema) })
  @ApiOkResponse({ standardSchema: importJobSchema })
  @StepDocs()
  saveMapping(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(importMappingSchema)) body: ImportMapping,
  ): Promise<ImportJob> {
    return this.service.saveMapping(id, body, auth.user.id);
  }

  @Post(':id/validate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.importsStudentsRun)
  @ApiOperation({ summary: 'Validate every row in the worker (MAPPING/VALIDATED → VALIDATING)' })
  @ApiOkResponse({ standardSchema: importJobSchema })
  @StepDocs()
  validate(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<ImportJob> {
    return this.service.validate(id, auth.user.id);
  }

  @Post(':id/commit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(
    PERMISSIONS.importsStudentsRun,
    PERMISSIONS.studentsWrite,
    PERMISSIONS.registrationsWrite,
  )
  @ApiOperation({
    summary: 'Import the valid rows (VALIDATED → PROCESSING)',
    description:
      'Creates new records for CREATE rows. UPDATE rows are applied only when applyUpdates is true; otherwise they are skipped.',
  })
  @ApiBody({ schema: openApiRequestSchema(commitImportSchema) })
  @ApiOkResponse({ standardSchema: importJobSchema })
  @StepDocs()
  commit(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(commitImportSchema)) body: CommitImport,
  ): Promise<ImportJob> {
    return this.service.commit(id, body, auth.user.id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.importsStudentsRun)
  @ApiOperation({ summary: 'Cancel an import that has not started importing' })
  @ApiOkResponse({ standardSchema: importJobSchema })
  @StepDocs()
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<ImportJob> {
    return this.service.cancel(id, auth.user.id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.importsStudentsRun)
  @ApiOperation({
    summary: 'Retry the failed step of an import (only when the failure is retryable)',
  })
  @ApiOkResponse({ standardSchema: importJobSchema })
  @StepDocs()
  retry(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<ImportJob> {
    return this.service.retry(id, auth.user.id);
  }

  @Get(':id/rows')
  @RequirePermissions(PERMISSIONS.importsRead)
  @ApiOperation({ summary: 'Validated rows (paginated, filterable)' })
  @ApiListQuery(importRowQuerySchema)
  @ApiOkResponse({ standardSchema: importRowListSchema })
  rows(
    @Param('id', UuidParamPipe) id: string,
    @Query(new ZodValidationPipe(importRowQuerySchema)) query: ImportRowQuery,
  ): Promise<ImportRowList> {
    return this.service.rows(id, query);
  }

  @Get(':id/rows/:rowNumber')
  @RequirePermissions(PERMISSIONS.importsRead)
  @ApiOperation({
    summary: 'One row: source cells, normalised values, issues, current vs proposed data',
  })
  @ApiOkResponse({ standardSchema: importRowDetailSchema })
  row(
    @Param('id', UuidParamPipe) id: string,
    @Param('rowNumber', RowNumberPipe) rowNumber: number,
  ): Promise<ImportRowDetail> {
    return this.service.row(id, rowNumber);
  }

  @Get(':id/error-report')
  @RequirePermissions(PERMISSIONS.importsRead)
  @ApiOperation({ summary: 'Download the error/warning report (.xlsx)' })
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOkResponse({ description: 'XLSX workbook' })
  @ApiResponse({ status: 404, description: 'No report (no row has errors or warnings)', ...error })
  async errorReport(
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return download(response, await this.service.errorReport(id));
  }
}
