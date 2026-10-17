import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import { z } from 'zod';
import {
  academicCertificatePreviewQuerySchema,
  academicCertificateTemplatesResponseSchema,
  type AcademicCertificatePreviewQuery,
  trainingCertificatePreviewQuerySchema,
  trainingCertificateTemplatesResponseSchema,
  type TrainingCertificatePreviewQuery,
} from '@docversity/validation';
import type { Response } from 'express';
import { CurrentAuth, RequirePermissions, type AuthContext } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CertificateTemplatesService } from './certificate-templates.service.js';

@ApiTags('certificate-templates')
@ApiCookieAuth('session')
@RequirePermissions(PERMISSIONS.templatesWrite)
@Controller('certificate-templates')
export class CertificateTemplatesController {
  constructor(private readonly service: CertificateTemplatesService) {}
  @Get()
  @ApiOkResponse({ standardSchema: trainingCertificateTemplatesResponseSchema })
  list(@Query(new ZodValidationPipe(z.object({}).strict())) _query: object) {
    return this.service.list();
  }
  @Get('preview')
  @ApiProduces('application/pdf')
  async preview(
    @Query(new ZodValidationPipe(trainingCertificatePreviewQuerySchema))
    query: TrainingCertificatePreviewQuery,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bytes = await this.service.preview(query, auth.user.id);
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(bytes, {
      type: 'application/pdf',
      disposition: `${query.disposition}; filename="sample-training-certificate-${query.fixture}-v1.pdf"`,
      length: bytes.length,
    });
  }
  @Get('academic')
  @ApiOkResponse({ standardSchema: academicCertificateTemplatesResponseSchema })
  listAcademic(@Query(new ZodValidationPipe(z.object({}).strict())) _query: object) {
    return this.service.listAcademic();
  }
  @Get('academic/preview')
  @ApiProduces('application/pdf')
  async academicPreview(
    @Query(new ZodValidationPipe(academicCertificatePreviewQuerySchema))
    query: AcademicCertificatePreviewQuery,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { bytes, templateId } = await this.service.academicPreview(query, auth.user.id);
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(bytes, {
      type: 'application/pdf',
      disposition: `${query.disposition}; filename="${templateId}-${query.fixture}-v${query.version}.pdf"`,
      length: bytes.length,
    });
  }
}
