import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import { z } from 'zod';
import {
  marksheetPreviewQuerySchema,
  marksheetTemplatesResponseSchema,
  type MarksheetPreviewQuery,
} from '@docversity/validation';
import type { Response } from 'express';
import { CurrentAuth, RequirePermissions, type AuthContext } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MarksheetTemplatesService } from './marksheet-templates.service.js';

@ApiTags('marksheet-templates')
@ApiCookieAuth('session')
@RequirePermissions(PERMISSIONS.templatesWrite)
@Controller('marksheet-templates')
export class MarksheetTemplatesController {
  constructor(private readonly service: MarksheetTemplatesService) {}
  @Get()
  @ApiOkResponse({ standardSchema: marksheetTemplatesResponseSchema })
  list(@Query(new ZodValidationPipe(z.object({}).strict())) _query: object) {
    return this.service.list();
  }
  @Get('preview')
  @ApiProduces('application/pdf')
  async preview(
    @Query(new ZodValidationPipe(marksheetPreviewQuerySchema)) query: MarksheetPreviewQuery,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bytes = await this.service.preview(query, auth.user.id);
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(bytes, {
      type: 'application/pdf',
      disposition: `${query.disposition}; filename="sample-marksheet-${query.fixture}-v1.pdf"`,
      length: bytes.length,
    });
  }
}
