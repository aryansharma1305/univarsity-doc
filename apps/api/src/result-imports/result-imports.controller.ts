import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  errorResponseSchema,
  type ResultImportContextOptions,
  resultImportContextOptionsSchema,
  type ResultPreview,
  resultPreviewContextSchema,
  type ResultPreviewMapping,
  resultPreviewMappingSchema,
  type ResultPreviewRowList,
  resultPreviewRowListSchema,
  type ResultPreviewRowQuery,
  resultPreviewRowQuerySchema,
  resultPreviewSchema,
} from '@docversity/validation';
import type { Response } from 'express';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../auth/auth.decorators.js';
import { ApiListQuery } from '../common/api-list-query.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type UploadRequest, WorkbookUploadInterceptor } from '../imports/upload.interceptor.js';
import {
  type DownloadFile,
  ResultImportsService,
  XLSX_CONTENT_TYPE,
} from './result-imports.service.js';

const error = { standardSchema: errorResponseSchema };

function download(response: Response, file: DownloadFile): StreamableFile {
  response.setHeader('Cache-Control', 'no-store');
  return new StreamableFile(Buffer.from(file.bytes), {
    type: XLSX_CONTENT_TYPE,
    disposition: `attachment; filename="${file.filename}"`,
    length: file.bytes.byteLength,
  });
}

/**
 * Results import PREVIEW (Phase 10B). Every route needs `imports.results.run`; previews belong to
 * the staff member who uploaded them (others get 404). Nothing here saves, approves or publishes
 * marks — there is deliberately no commit route.
 */
@ApiTags('result-imports')
@ApiCookieAuth('session')
@RequirePermissions(PERMISSIONS.importsResultsRun)
@Controller('result-imports')
export class ResultImportsController {
  constructor(private readonly service: ResultImportsService) {}

  @Header('Cache-Control', 'no-store')
  @Get('template')
  @ApiOperation({ summary: 'Download the results import template (.xlsx)' })
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOkResponse({ description: 'XLSX workbook (Instructions + Results sheets)' })
  async template(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return download(response, await this.service.resultTemplate());
  }

  @Header('Cache-Control', 'no-store')
  @Get('context')
  @ApiOperation({
    summary: 'Courses, curriculum versions and examinations available for a results preview',
  })
  @ApiOkResponse({ standardSchema: resultImportContextOptionsSchema })
  context(): Promise<ResultImportContextOptions> {
    return this.service.contextOptions();
  }

  @Header('Cache-Control', 'no-store')
  @Post('previews')
  @UseInterceptors(WorkbookUploadInterceptor)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Upload a results workbook for a temporary, private preview',
    description:
      'Checks the academic context against the examination record, reads the workbook (formulas are never evaluated) and keeps its rows temporarily. Nothing is saved to results.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'programId',
        'curriculumId',
        'academicSessionId',
        'periodNumber',
        'examinationId',
        'file',
      ],
      properties: {
        programId: { type: 'string', format: 'uuid' },
        curriculumId: { type: 'string', format: 'uuid' },
        academicSessionId: { type: 'string', format: 'uuid' },
        periodNumber: { type: 'integer', minimum: 1 },
        examinationId: { type: 'string', format: 'uuid' },
        file: { type: 'string', format: 'binary', description: '.xlsx workbook' },
      },
    },
  })
  @ApiCreatedResponse({ standardSchema: resultPreviewSchema })
  @ApiResponse({ status: 400, description: 'Invalid context or file', ...error })
  @ApiResponse({
    status: 409,
    description: 'Examination not available / too many previews',
    ...error,
  })
  @ApiResponse({ status: 413, description: 'File larger than IMPORT_MAX_FILE_MB', ...error })
  create(@CurrentAuth() auth: AuthContext, @Req() request: UploadRequest): Promise<ResultPreview> {
    const body = (request.body as Record<string, unknown> | undefined) ?? {};
    const context = new ZodValidationPipe(resultPreviewContextSchema).transform({
      programId: body.programId,
      curriculumId: body.curriculumId,
      academicSessionId: body.academicSessionId,
      periodNumber: body.periodNumber,
      examinationId: body.examinationId,
    });
    return this.service.create(context, request.file, auth.user.id);
  }

  @Header('Cache-Control', 'no-store')
  @Get('previews/:id')
  @ApiOperation({ summary: 'The preview: context, worksheets, mapping, counts, expiry' })
  @ApiOkResponse({ standardSchema: resultPreviewSchema })
  @ApiResponse({ status: 404, description: 'Unknown, expired or another user’s preview', ...error })
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<ResultPreview> {
    return this.service.get(id, auth.user.id);
  }

  @Header('Cache-Control', 'no-store')
  @Post('previews/:id/validate')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Map columns and classify every row (VALID / WARNING / ERROR)' })
  @ApiBody({ schema: openApiRequestSchema(resultPreviewMappingSchema) })
  @ApiOkResponse({ standardSchema: resultPreviewSchema })
  @ApiResponse({ status: 400, description: 'Mapping problems (field details included)', ...error })
  validate(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(resultPreviewMappingSchema)) body: ResultPreviewMapping,
  ): Promise<ResultPreview> {
    return this.service.validate(id, body, auth.user.id);
  }

  @Header('Cache-Control', 'no-store')
  @Get('previews/:id/rows')
  @ApiOperation({ summary: 'Classified rows (paginated, filterable, searchable)' })
  @ApiListQuery(resultPreviewRowQuerySchema)
  @ApiOkResponse({ standardSchema: resultPreviewRowListSchema })
  rows(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Query(new ZodValidationPipe(resultPreviewRowQuerySchema)) query: ResultPreviewRowQuery,
  ): Promise<ResultPreviewRowList> {
    return this.service.rows(id, query, auth.user.id);
  }

  @Header('Cache-Control', 'no-store')
  @Get('previews/:id/error-report')
  @ApiOperation({ summary: 'Download the error/warning report (.xlsx)' })
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOkResponse({ description: 'XLSX workbook' })
  @ApiResponse({ status: 404, description: 'No report (not validated, or no issues)', ...error })
  async errorReport(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return download(response, await this.service.errorReport(id, auth.user.id));
  }

  @Delete('previews/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Discard the preview now (it would otherwise expire on its own)' })
  @ApiNoContentResponse({ description: 'Discarded' })
  async discard(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.service.discard(id, auth.user.id);
  }
}
