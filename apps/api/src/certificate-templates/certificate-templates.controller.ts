import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import { z } from 'zod';
import {
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
}
