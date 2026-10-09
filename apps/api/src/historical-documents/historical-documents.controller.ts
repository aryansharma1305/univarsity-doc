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
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  type DocumentDisposition,
  documentDispositionSchema,
  type DocumentVariant,
  documentVariantSchema,
  errorResponseSchema,
  type HistoricalDocumentDetail,
  historicalDocumentDetailSchema,
  type HistoricalDocumentList,
  historicalDocumentListSchema,
  type HistoricalDocumentQuery,
  historicalDocumentQuerySchema,
  replaceHistoricalDocumentSchema,
  type ReviewAuthenticity,
  reviewAuthenticitySchema,
  type StudentDocumentList,
  studentDocumentListSchema,
  type UpdateHistoricalDocument,
  updateHistoricalDocumentSchema,
  uploadHistoricalDocumentSchema,
  type WithdrawHistoricalDocument,
  withdrawHistoricalDocumentSchema,
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
import {
  type DocumentUploadRequest,
  DocumentUploadInterceptor,
} from './document-upload.interceptor.js';
import { type DocumentFile, HistoricalDocumentsService } from './historical-documents.service.js';

const error = { standardSchema: errorResponseSchema };

/**
 * Streams a private document. No caching, no MIME sniffing, a generated file name (the uploaded
 * name is never echoed into a header), and a sandboxing CSP so an opened file cannot run script or
 * reach the network in the portal's origin.
 */
function send(res: Response, file: DocumentFile): StreamableFile {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'self'",
  );
  return new StreamableFile(Buffer.from(file.bytes), {
    type: file.contentType,
    disposition: `${file.disposition}; filename="${file.filename}"`,
    length: file.bytes.byteLength,
  });
}

const multipartDoc = (withRegistration: boolean) =>
  ApiBody({
    schema: {
      type: 'object',
      required: withRegistration
        ? ['file', 'studentRegistrationId', 'documentType', 'title', 'provenance']
        : ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF, JPEG or PNG (≤ 15 MB)' },
        ...(withRegistration ? { studentRegistrationId: { type: 'string', format: 'uuid' } } : {}),
        documentType: { type: 'string' },
        title: { type: 'string' },
        certificateNumber: { type: 'string' },
        issuedOn: { type: 'string', format: 'date' },
        provenance: { type: 'string' },
        provenanceNote: { type: 'string' },
        legacySourceSystem: { type: 'string' },
        legacyRecordId: { type: 'string' },
        legacyVerificationUrl: { type: 'string' },
      },
    },
  });

@ApiTags('historical-documents')
@ApiCookieAuth('session')
@Controller('historical-documents')
export class HistoricalDocumentsController {
  constructor(private readonly service: HistoricalDocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.historicalDocumentsRead)
  @ApiOperation({ summary: 'Historical documents (newest first by default)' })
  @ApiListQuery(historicalDocumentQuerySchema)
  @ApiOkResponse({ standardSchema: historicalDocumentListSchema })
  list(
    @Query(new ZodValidationPipe(historicalDocumentQuerySchema)) query: HistoricalDocumentQuery,
  ): Promise<HistoricalDocumentList> {
    return this.service.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.historicalDocumentsUpload)
  @UseInterceptors(DocumentUploadInterceptor)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Upload a historical document for a registration (created as a DRAFT)',
    description:
      'multipart/form-data. The file is validated by content (PDF without active content or encryption; decodable JPEG/PNG), stored privately under a generated key, and hashed (SHA-256). Students see it only after it is published.',
  })
  @ApiConsumes('multipart/form-data')
  @multipartDoc(true)
  @ApiCreatedResponse({ standardSchema: historicalDocumentDetailSchema })
  @ApiResponse({
    status: 400,
    description: 'Invalid metadata or unsafe/unsupported file',
    ...error,
  })
  @ApiResponse({
    status: 409,
    description: 'Same file already on record for the registration',
    ...error,
  })
  @ApiResponse({ status: 413, description: 'File larger than 15 MB', ...error })
  @ApiResponse({ status: 503, description: 'Storage unavailable (nothing recorded)', ...error })
  upload(
    @CurrentAuth() auth: AuthContext,
    @Req() request: DocumentUploadRequest,
  ): Promise<HistoricalDocumentDetail> {
    const body = new ZodValidationPipe(uploadHistoricalDocumentSchema).transform(
      request.body ?? {},
    );
    return this.service.upload(body, request.file, auth.user.id);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.historicalDocumentsRead)
  @ApiOperation({ summary: 'A document with provenance, lifecycle, replacement chain and history' })
  @ApiOkResponse({ standardSchema: historicalDocumentDetailSchema })
  detail(
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<HistoricalDocumentDetail> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.detail(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.historicalDocumentsUpload)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Edit the metadata of a DRAFT (published documents are replaced instead)',
  })
  @ApiBody({ schema: openApiRequestSchema(updateHistoricalDocumentSchema) })
  @ApiOkResponse({ standardSchema: historicalDocumentDetailSchema })
  @ApiResponse({ status: 409, description: 'Not a draft (DOCUMENT_NOT_EDITABLE)', ...error })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateHistoricalDocumentSchema)) body: UpdateHistoricalDocument,
  ): Promise<HistoricalDocumentDetail> {
    return this.service.update(id, body, auth.user.id);
  }

  @Post(':id/replace')
  @RequirePermissions(PERMISSIONS.historicalDocumentsUpload)
  @UseInterceptors(DocumentUploadInterceptor)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Upload a corrected replacement (new DRAFT linked to the original)',
    description:
      'For PUBLISHED or WITHDRAWN documents. The original stays unchanged until the replacement is published, then becomes SUPERSEDED. Nothing is deleted.',
  })
  @ApiConsumes('multipart/form-data')
  @multipartDoc(false)
  @ApiCreatedResponse({ standardSchema: historicalDocumentDetailSchema })
  @ApiResponse({ status: 409, description: 'Not replaceable', ...error })
  replace(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Req() request: DocumentUploadRequest,
  ): Promise<HistoricalDocumentDetail> {
    const body = new ZodValidationPipe(replaceHistoricalDocumentSchema).transform(
      request.body ?? {},
    );
    return this.service.replace(id, body, request.file, auth.user.id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.historicalDocumentsPublish)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Make the document visible to its student (supersedes a replaced original)',
  })
  @ApiOkResponse({ standardSchema: historicalDocumentDetailSchema })
  @ApiResponse({ status: 409, description: 'Not publishable', ...error })
  publish(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<HistoricalDocumentDetail> {
    return this.service.publish(id, auth.user.id);
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.historicalDocumentsPublish)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Hide the document from the student, with a reason (record kept)' })
  @ApiBody({ schema: openApiRequestSchema(withdrawHistoricalDocumentSchema) })
  @ApiOkResponse({ standardSchema: historicalDocumentDetailSchema })
  @ApiResponse({ status: 409, description: 'Not withdrawable', ...error })
  withdraw(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(withdrawHistoricalDocumentSchema)) body: WithdrawHistoricalDocument,
  ): Promise<HistoricalDocumentDetail> {
    return this.service.withdraw(id, body, auth.user.id);
  }

  @Post(':id/authenticity')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.historicalDocumentsVerify)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Record the official authenticity review (not by the uploader)',
    description:
      'Separate from student visibility. Records that staff confirmed the document against university records, or that it is disputed — never a cryptographic verification.',
  })
  @ApiBody({ schema: openApiRequestSchema(reviewAuthenticitySchema) })
  @ApiOkResponse({ standardSchema: historicalDocumentDetailSchema })
  @ApiResponse({
    status: 403,
    description: 'Missing permission, or the reviewer uploaded it',
    ...error,
  })
  review(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(reviewAuthenticitySchema)) body: ReviewAuthenticity,
  ): Promise<HistoricalDocumentDetail> {
    return this.service.reviewAuthenticity(id, body, auth.user.id);
  }

  @Get(':id/file')
  @RequirePermissions(PERMISSIONS.historicalDocumentsRead)
  @ApiOperation({
    summary: 'Preview (inline) or download (attachment) a document file; audited',
    description:
      '`variant=original` (default): the evidential original exactly as uploaded. `variant=student`: exactly what the student receives — for images the separate copy without embedded metadata (409 DOCUMENT_NOT_READY until it exists), for PDFs the original.',
  })
  @ApiQuery({ name: 'disposition', enum: ['inline', 'attachment'], required: false })
  @ApiQuery({ name: 'variant', enum: ['original', 'student'], required: false })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiResponse({ status: 409, description: 'Student copy not created yet', ...error })
  async file(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Query('disposition', new ZodValidationPipe(documentDispositionSchema))
    disposition: DocumentDisposition,
    @Query('variant', new ZodValidationPipe(documentVariantSchema))
    variant: DocumentVariant,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.service.staffFile(id, disposition, variant, auth.user.id));
  }
}

/** The signed-in student's own PUBLISHED documents. Students cannot upload, edit or publish. */
@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/documents')
export class StudentDocumentsController {
  constructor(private readonly service: HistoricalDocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in student’s published documents' })
  @ApiOkResponse({ standardSchema: studentDocumentListSchema })
  list(
    @CurrentStudent() student: StudentContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentDocumentList> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.listOwn(student.studentId);
  }

  @Get(':id/file')
  @ApiOperation({
    summary:
      'Preview or download one of the student’s published documents (images: the copy without embedded metadata); audited',
  })
  @ApiQuery({ name: 'disposition', enum: ['inline', 'attachment'], required: false })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiResponse({
    status: 404,
    description: 'Not found, not published, or not this student’s',
    ...error,
  })
  @ApiResponse({
    status: 409,
    description: 'The metadata-free copy of an image is still being prepared (nothing is served)',
    ...error,
  })
  async file(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Query('disposition', new ZodValidationPipe(documentDispositionSchema))
    disposition: DocumentDisposition,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(
      res,
      await this.service.ownFile(student.studentId, student.accountId, id, disposition),
    );
  }
}
