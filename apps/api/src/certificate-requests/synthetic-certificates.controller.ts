import { Body, Controller, Get, HttpCode, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PERMISSIONS } from '@docversity/types';
import {
  prepareSyntheticCertificateSchema,
  syntheticCertificateCommandSchema,
  syntheticCertificateReceiptSchema,
  type PrepareSyntheticCertificate,
  type SyntheticCertificateCommand,
} from '@docversity/validation';
import { CurrentAuth, RequirePermissions, type AuthContext } from '../auth/auth.decorators.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { openApiRequestSchema } from '../common/openapi.js';
import {
  CurrentStudent,
  StudentRoute,
  type StudentContext,
} from '../student-auth/student-auth.decorators.js';
import { SyntheticCertificatesService } from './synthetic-certificates.service.js';

@ApiTags('synthetic-certificates')
@ApiCookieAuth('session')
@Controller('certificate-requests')
export class SyntheticCertificatePreparationController {
  constructor(private readonly service: SyntheticCertificatesService) {}
  @Post(':id/synthetic-credential')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesGenerate)
  @ApiBody({ schema: openApiRequestSchema(prepareSyntheticCertificateSchema) })
  @ApiOkResponse({ standardSchema: syntheticCertificateReceiptSchema })
  prepare(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() actor: AuthContext,
    @Body(new ZodValidationPipe(prepareSyntheticCertificateSchema))
    body: PrepareSyntheticCertificate,
  ) {
    return this.service.prepare(id, body, actor.user.id);
  }
}
@ApiTags('synthetic-certificates')
@ApiCookieAuth('session')
@Controller('synthetic-certificates')
export class SyntheticCertificatesController {
  constructor(private readonly service: SyntheticCertificatesService) {}
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesApprove)
  @ApiBody({ schema: openApiRequestSchema(syntheticCertificateCommandSchema) })
  @ApiOkResponse({ standardSchema: syntheticCertificateReceiptSchema })
  approve(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() actor: AuthContext,
    @Body(new ZodValidationPipe(syntheticCertificateCommandSchema))
    body: SyntheticCertificateCommand,
  ) {
    return this.service.command(id, 'APPROVE', body, actor.user.id);
  }
  @Post(':id/issue')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesIssue)
  @ApiBody({ schema: openApiRequestSchema(syntheticCertificateCommandSchema) })
  @ApiOkResponse({ standardSchema: syntheticCertificateReceiptSchema })
  issue(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() actor: AuthContext,
    @Body(new ZodValidationPipe(syntheticCertificateCommandSchema))
    body: SyntheticCertificateCommand,
  ) {
    return this.service.command(id, 'ISSUE', body, actor.user.id);
  }
  @Post(':id/revoke')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesRevoke)
  @ApiBody({ schema: openApiRequestSchema(syntheticCertificateCommandSchema) })
  @ApiOkResponse({ standardSchema: syntheticCertificateReceiptSchema })
  revoke(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() actor: AuthContext,
    @Body(new ZodValidationPipe(syntheticCertificateCommandSchema))
    body: SyntheticCertificateCommand,
  ) {
    return this.service.command(id, 'REVOKE', body, actor.user.id);
  }
}
@ApiTags('synthetic-certificates')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/synthetic-certificates')
export class StudentSyntheticCertificatesController {
  constructor(private readonly service: SyntheticCertificatesService) {}
  @Get(':id/preview')
  @ApiProduces('application/pdf')
  async preview(
    @Param('id', UuidParamPipe) id: string,
    @CurrentStudent() student: StudentContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bytes = await this.service.preview(student.studentId, id);
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(bytes, {
      type: 'application/pdf',
      disposition: 'inline; filename="sample-unsigned-certificate.pdf"',
      length: bytes.length,
    });
  }
}
