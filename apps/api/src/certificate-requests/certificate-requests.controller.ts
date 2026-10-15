import { Body, Controller, Get, Post, Param, Query, HttpCode } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBody,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  certificateServiceListSchema,
  certificateRequestListSchema,
  certificateRequestSchema,
  certificateRequestQuerySchema,
  submitCertificateRequestSchema,
  certificateTransitionSchema,
  certificateResponseSchema,
  certificateVersionSchema,
  type CertificateRequestQuery,
  type SubmitCertificateRequest,
  type CertificateTransition,
} from '@docversity/validation';
import {
  CurrentStudent,
  StudentRoute,
  type StudentContext,
} from '../student-auth/student-auth.decorators.js';
import { CurrentAuth, RequirePermissions, type AuthContext } from '../auth/auth.decorators.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CertificateRequestsService } from './certificate-requests.service.js';
@ApiTags('student-certificate-requests')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student')
export class StudentCertificateRequestsController {
  constructor(private readonly service: CertificateRequestsService) {}
  @ApiOkResponse({ standardSchema: certificateServiceListSchema })
  @Get('certificate-services')
  catalogue() {
    return this.service.catalogue();
  }
  @ApiOkResponse({ standardSchema: certificateRequestListSchema })
  @Get('certificate-requests')
  list(
    @CurrentStudent() s: StudentContext,
    @Query(new ZodValidationPipe(certificateRequestQuerySchema)) q: CertificateRequestQuery,
  ) {
    return this.service.list(q, s.studentId);
  }
  @ApiOkResponse({ standardSchema: certificateRequestSchema })
  @Get('certificate-requests/:id')
  detail(@CurrentStudent() s: StudentContext, @Param('id', UuidParamPipe) id: string) {
    return this.service.detail(id, s.studentId);
  }
  @ApiCreatedResponse({ standardSchema: certificateRequestSchema })
  @ApiBody({ schema: openApiRequestSchema(submitCertificateRequestSchema) })
  @Post('certificate-requests')
  submit(
    @CurrentStudent() s: StudentContext,
    @Body(new ZodValidationPipe(submitCertificateRequestSchema)) b: SubmitCertificateRequest,
  ) {
    return this.service.submit(s.studentId, b);
  }
  @ApiOkResponse({ standardSchema: certificateRequestSchema })
  @ApiBody({ schema: openApiRequestSchema(certificateResponseSchema) })
  @Post('certificate-requests/:id/respond')
  @HttpCode(200)
  respond(
    @CurrentStudent() s: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(certificateResponseSchema)) b: CertificateTransition,
  ) {
    return this.service.transition(id, 'RESPOND', b, { studentId: s.studentId });
  }
  @ApiOkResponse({ standardSchema: certificateRequestSchema })
  @ApiBody({ schema: openApiRequestSchema(certificateVersionSchema) })
  @Post('certificate-requests/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentStudent() s: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(certificateVersionSchema)) b: CertificateTransition,
  ) {
    return this.service.transition(id, 'CANCEL', b, { studentId: s.studentId });
  }
}
@ApiTags('certificate-requests')
@ApiCookieAuth('session')
@RequirePermissions(PERMISSIONS.certificateRequestsRead)
@Controller('certificate-requests')
export class CertificateRequestsController {
  constructor(private readonly service: CertificateRequestsService) {}
  @ApiOkResponse({ standardSchema: certificateRequestListSchema })
  @Get()
  list(@Query(new ZodValidationPipe(certificateRequestQuerySchema)) q: CertificateRequestQuery) {
    return this.service.list(q);
  }
  @ApiOkResponse({ standardSchema: certificateRequestSchema })
  @Get(':id')
  detail(@Param('id', UuidParamPipe) id: string) {
    return this.service.detail(id);
  }
  @ApiOkResponse({ standardSchema: certificateRequestSchema })
  @ApiBody({ schema: openApiRequestSchema(certificateTransitionSchema) })
  @Post(':id/request-information')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificateRequestsReview)
  information(
    @CurrentAuth() a: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(certificateTransitionSchema)) b: CertificateTransition,
  ) {
    return this.service.transition(id, 'REQUEST_INFORMATION', b, { userId: a.user.id });
  }
  @ApiOkResponse({ standardSchema: certificateRequestSchema })
  @ApiBody({ schema: openApiRequestSchema(certificateTransitionSchema) })
  @Post(':id/record-review')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificateRequestsReview)
  review(
    @CurrentAuth() a: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(certificateTransitionSchema)) b: CertificateTransition,
  ) {
    return this.service.transition(id, 'RECORD_REVIEW', b, { userId: a.user.id });
  }
  @ApiOkResponse({ standardSchema: certificateRequestSchema })
  @ApiBody({ schema: openApiRequestSchema(certificateVersionSchema) })
  @Post(':id/complete-review')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificateRequestsReview)
  complete(
    @CurrentAuth() a: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(certificateVersionSchema)) b: CertificateTransition,
  ) {
    return this.service.transition(id, 'COMPLETE_REVIEW', b, { userId: a.user.id });
  }
  @ApiOkResponse({ standardSchema: certificateRequestSchema })
  @ApiBody({ schema: openApiRequestSchema(certificateVersionSchema) })
  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificateRequestsReview)
  close(
    @CurrentAuth() a: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(certificateVersionSchema)) b: CertificateTransition,
  ) {
    return this.service.transition(id, 'CLOSE', b, { userId: a.user.id });
  }
}
