import {
  Controller,
  Delete,
  Get,
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
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  type DocumentDisposition,
  documentDispositionSchema,
  errorResponseSchema,
  type StudentUpload,
  type StudentUploadCategory,
  studentUploadCategorySchema,
  type StudentUploadList,
  studentUploadListSchema,
  studentUploadSchema,
} from '@docversity/validation';
import type { Response } from 'express';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../auth/auth.decorators.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type DocumentUploadRequest,
  DocumentUploadInterceptor,
} from '../historical-documents/document-upload.interceptor.js';
import {
  CurrentStudent,
  type StudentContext,
  StudentRoute,
} from '../student-auth/student-auth.decorators.js';
import { type UploadFile, StudentUploadsService } from './student-uploads.service.js';
import { UploadThrottleInterceptor } from './upload-throttle.interceptor.js';

const error = { standardSchema: errorResponseSchema };
const categoryPipe = new ZodValidationPipe(studentUploadCategorySchema);
const dispositionPipe = new ZodValidationPipe(documentDispositionSchema);

/** Private file: never cached or sniffed, generated file name, sandboxed if opened inline. */
function send(res: Response, file: UploadFile): StreamableFile {
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

/** The signed-in student's own uploads. The student comes from the session only. */
@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/uploads')
export class StudentOwnUploadsController {
  constructor(private readonly service: StudentUploadsService) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in student’s uploaded documents (one per category)' })
  @ApiOkResponse({ standardSchema: studentUploadListSchema })
  list(
    @CurrentStudent() student: StudentContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentUploadList> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.listOwn(student.studentId);
  }

  @Post(':category')
  // Order matters: the rate limit is checked before the body is buffered.
  @UseInterceptors(UploadThrottleInterceptor, DocumentUploadInterceptor)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Upload or replace the file for one category; audited',
    description:
      'multipart/form-data with one `file` (PDF, JPEG or PNG, ≤ 15 MB). Checked by content; images are stored re-encoded without embedded metadata. Stored privately under a generated key.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ standardSchema: studentUploadSchema })
  @ApiResponse({ status: 400, description: 'Unsafe or unsupported file', ...error })
  @ApiResponse({ status: 413, description: 'File larger than 15 MB', ...error })
  @ApiResponse({
    status: 429,
    description: 'Too many uploads (checked before the body is read)',
    ...error,
  })
  @ApiResponse({ status: 503, description: 'Storage unavailable (nothing changed)', ...error })
  save(
    @CurrentStudent() student: StudentContext,
    @Param('category', categoryPipe) category: StudentUploadCategory,
    @Req() request: DocumentUploadRequest,
  ): Promise<StudentUpload> {
    return this.service.save(student.studentId, student.accountId, category, request.file);
  }

  @Delete(':category')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Delete the file for one category; audited' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Nothing uploaded for this category', ...error })
  async remove(
    @CurrentStudent() student: StudentContext,
    @Param('category', categoryPipe) category: StudentUploadCategory,
  ): Promise<void> {
    await this.service.remove(student.studentId, student.accountId, category);
  }

  @Get(':category/file')
  @ApiOperation({ summary: 'View or download the student’s own file for one category' })
  @ApiQuery({ name: 'disposition', enum: ['inline', 'attachment'], required: false })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiResponse({ status: 404, description: 'Nothing uploaded for this category', ...error })
  async file(
    @CurrentStudent() student: StudentContext,
    @Param('category', categoryPipe) category: StudentUploadCategory,
    @Query('disposition', dispositionPipe) disposition: DocumentDisposition,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(
      res,
      await this.service.ownFile(student.studentId, student.accountId, category, disposition),
    );
  }
}

/** Staff view of a student's uploads (read-only). Every list view and download is audited. */
@ApiTags('students')
@ApiCookieAuth('session')
@Controller('students/:studentId/uploads')
export class StaffStudentUploadsController {
  constructor(private readonly service: StudentUploadsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.studentUploadsRead)
  @ApiOperation({ summary: 'A student’s uploaded documents; audited' })
  @ApiOkResponse({ standardSchema: studentUploadListSchema })
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('studentId', UuidParamPipe) studentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentUploadList> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.staffList(studentId, auth.user.id);
  }

  @Get(':id/file')
  @RequirePermissions(PERMISSIONS.studentUploadsRead)
  @ApiOperation({ summary: 'View or download one of a student’s uploaded files; audited' })
  @ApiQuery({ name: 'disposition', enum: ['inline', 'attachment'], required: false })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiResponse({ status: 404, description: 'Not found (or not this student’s)', ...error })
  async file(
    @CurrentAuth() auth: AuthContext,
    @Param('studentId', UuidParamPipe) studentId: string,
    @Param('id', UuidParamPipe) id: string,
    @Query('disposition', dispositionPipe) disposition: DocumentDisposition,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return send(res, await this.service.staffFile(studentId, id, disposition, auth.user.id));
  }
}
