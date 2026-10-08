import {
  Body,
  Controller,
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
  approveProfileRequestSchema,
  errorResponseSchema,
  type ProfilePhotoVariant,
  profilePhotoVariantSchema,
  type ProfileRequestDetail,
  profileRequestDetailSchema,
  type ProfileRequestList,
  profileRequestListSchema,
  type ProfileRequestQuery,
  profileRequestQuerySchema,
  type RejectProfileRequest,
  rejectProfileRequestSchema,
  type StudentProfileRequest,
  type StudentProfileRequestList,
  studentProfileRequestListSchema,
  studentProfileRequestSchema,
  type SubmitProfileRequest,
  submitProfileRequestSchema,
} from '@docversity/validation';
import type { Response } from 'express';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../auth/auth.decorators.js';
import { ApiListQuery } from '../common/api-list-query.js';
import { Errors } from '../common/app-error.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  CurrentStudent,
  type StudentContext,
  StudentRoute,
} from '../student-auth/student-auth.decorators.js';
import { type PhotoUploadRequest, PhotoUploadInterceptor } from './photo-upload.interceptor.js';
import { type PhotoFile, ProfileRequestsService } from './profile-requests.service.js';

const error = { standardSchema: errorResponseSchema };

/** Private photo: never cached, never sniffed, shown inline only. */
function photo(res: Response, file: PhotoFile): StreamableFile {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return new StreamableFile(Buffer.from(file.bytes), {
    type: file.contentType,
    disposition: 'inline; filename="photo"',
    length: file.bytes.byteLength,
  });
}

/** Multipart `changes` arrives as a JSON string; anything unparsable is a field error. */
function parseSubmission(body: unknown): SubmitProfileRequest {
  const fields = (body ?? {}) as Record<string, unknown>;
  const unknown = Object.keys(fields).filter((key) => key !== 'changes' && key !== 'note');
  if (unknown.length > 0) {
    throw Errors.validation(
      unknown.map((key) => ({ path: key, message: 'This field is not accepted.' })),
    );
  }
  let changes: unknown = undefined;
  if (typeof fields.changes === 'string' && fields.changes.trim() !== '') {
    try {
      changes = JSON.parse(fields.changes);
    } catch {
      throw Errors.validation([{ path: 'changes', message: 'The changes could not be read.' }]);
    }
  }
  return new ZodValidationPipe(submitProfileRequestSchema).transform({
    ...(changes === undefined ? {} : { changes }),
    ...(fields.note === undefined ? {} : { note: fields.note }),
  });
}

/** The signed-in student's own profile requests and photo. The student comes from the session only. */
@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student')
export class StudentProfileController {
  constructor(private readonly service: ProfileRequestsService) {}

  @Get('photo')
  @ApiOperation({ summary: 'The signed-in student’s official photo (404 when none)' })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiResponse({ status: 404, description: 'No photo on record', ...error })
  async officialPhoto(
    @CurrentStudent() student: StudentContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return photo(res, await this.service.officialPhotoOf(student.studentId));
  }

  @Get('profile-requests')
  @ApiOperation({ summary: 'The signed-in student’s profile change requests (newest first)' })
  @ApiOkResponse({ standardSchema: studentProfileRequestListSchema })
  list(
    @CurrentStudent() student: StudentContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentProfileRequestList> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.listOwn(student.studentId);
  }

  @Post('profile-requests')
  @UseInterceptors(PhotoUploadInterceptor)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Submit a profile change request for approval',
    description:
      'multipart/form-data: `changes` (JSON of proposed fields), optional `note`, optional `photo` (JPEG/PNG/WebP). The photo is decoded, checked and re-encoded server-side. One pending request per student.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        changes: { type: 'string', description: 'JSON object (ProfileChanges)' },
        note: { type: 'string', maxLength: 500 },
        photo: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({ standardSchema: studentProfileRequestSchema })
  @ApiResponse({ status: 400, description: 'Invalid values / photo / no changes', ...error })
  @ApiResponse({ status: 409, description: 'A request is already pending', ...error })
  @ApiResponse({ status: 413, description: 'Photo too large', ...error })
  @ApiResponse({ status: 503, description: 'Photo storage unavailable', ...error })
  submit(
    @CurrentStudent() student: StudentContext,
    @Req() request: PhotoUploadRequest,
  ): Promise<StudentProfileRequest> {
    return this.service.submit(
      student.studentId,
      student.accountId,
      parseSubmission(request.body),
      request.file,
    );
  }

  @Get('profile-requests/:id')
  @ApiOperation({ summary: 'One of the signed-in student’s requests' })
  @ApiOkResponse({ standardSchema: studentProfileRequestSchema })
  @ApiResponse({ status: 404, description: 'Not found (or not this student’s)', ...error })
  get(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<StudentProfileRequest> {
    return this.service.getOwn(student.studentId, id);
  }

  @Post('profile-requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Cancel one of the signed-in student’s pending requests' })
  @ApiOkResponse({ standardSchema: studentProfileRequestSchema })
  @ApiResponse({ status: 409, description: 'Not pending', ...error })
  cancel(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<StudentProfileRequest> {
    return this.service.cancelOwn(student.studentId, student.accountId, id);
  }

  @Get('profile-requests/:id/photo')
  @ApiOperation({ summary: 'The photo submitted with one of the signed-in student’s requests' })
  @ApiProduces('image/jpeg')
  async requestPhoto(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return photo(res, await this.service.ownRequestPhoto(student.studentId, id));
  }
}

/** Staff review of student profile change requests (Phase 7). */
@ApiTags('profile-requests')
@ApiCookieAuth('session')
@Controller('profile-requests')
export class ProfileRequestsController {
  constructor(private readonly service: ProfileRequestsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.studentProfileRequestsRead)
  @ApiOperation({ summary: 'Profile change requests (default: oldest first)' })
  @ApiListQuery(profileRequestQuerySchema)
  @ApiOkResponse({ standardSchema: profileRequestListSchema })
  list(
    @Query(new ZodValidationPipe(profileRequestQuerySchema)) query: ProfileRequestQuery,
  ): Promise<ProfileRequestList> {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.studentProfileRequestsRead)
  @ApiOperation({ summary: 'A request with submitted, proposed and current official values' })
  @ApiOkResponse({ standardSchema: profileRequestDetailSchema })
  detail(
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProfileRequestDetail> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.detail(id);
  }

  @Get(':id/photo')
  @RequirePermissions(PERMISSIONS.studentProfileRequestsRead)
  @ApiOperation({ summary: 'The proposed photo, or the student’s current official photo' })
  @ApiQuery({ name: 'variant', enum: ['proposed', 'official'] })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  async photo(
    @Param('id', UuidParamPipe) id: string,
    @Query('variant', new ZodValidationPipe(profilePhotoVariantSchema))
    variant: ProfilePhotoVariant,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return photo(res, await this.service.requestPhoto(id, variant));
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.studentProfileRequestsReview)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Approve: apply the requested fields to the official record',
    description:
      'Atomic: locks the request and the student, refuses (409 PROFILE_REQUEST_STALE) if any requested value changed after submission, then updates only the requested fields.',
  })
  @ApiBody({ schema: openApiRequestSchema(approveProfileRequestSchema) })
  @ApiOkResponse({ standardSchema: profileRequestDetailSchema })
  @ApiResponse({ status: 409, description: 'Not pending, or stale', ...error })
  approve(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(approveProfileRequestSchema.optional())) _body: unknown,
  ): Promise<ProfileRequestDetail> {
    return this.service.approve(id, auth.user.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.studentProfileRequestsReview)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Reject with a reason shown to the student (no record change)' })
  @ApiBody({ schema: openApiRequestSchema(rejectProfileRequestSchema) })
  @ApiOkResponse({ standardSchema: profileRequestDetailSchema })
  @ApiResponse({ status: 409, description: 'Not pending', ...error })
  reject(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(rejectProfileRequestSchema)) body: RejectProfileRequest,
  ): Promise<ProfileRequestDetail> {
    return this.service.reject(id, body, auth.user.id);
  }
}
