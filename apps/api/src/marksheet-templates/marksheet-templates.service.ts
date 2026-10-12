import { Injectable, HttpStatus } from '@nestjs/common';
import {
  SYNTHETIC_FIXTURES,
  marksheetTemplates,
  marksheetTemplate,
  renderMarksheetPreview,
  syntheticMarksheet,
} from '@docversity/documents';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ERROR_CODES,
  marksheetTemplatesResponseSchema,
  type MarksheetPreviewQuery,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/app-error.js';

@Injectable()
export class MarksheetTemplatesService {
  private active = 0;
  constructor(private readonly audit: AuditService) {}
  list() {
    return marksheetTemplatesResponseSchema.parse({
      templates: marksheetTemplates(),
      fixtures: SYNTHETIC_FIXTURES,
    });
  }
  async preview(query: MarksheetPreviewQuery, actor: string) {
    if (this.active >= 2)
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.internalError,
        'Preview rendering is busy. Try again shortly.',
        { headers: { 'Retry-After': '5' } },
      );
    this.active++;
    try {
      const template = marksheetTemplate(query.templateId, query.version);
      const rendered = await renderMarksheetPreview(syntheticMarksheet(query.fixture), template);
      await this.audit.writeAuditEvent({
        actorUserId: actor,
        action: AUDIT_ACTIONS.marksheetPreviewGenerated,
        entityType: 'SyntheticMarksheetPreview',
        metadata: {
          templateId: template.id,
          templateVersion: template.version,
          fixture: query.fixture,
          pages: rendered.pages,
          bytes: rendered.bytes.length,
        },
      });
      return rendered.bytes;
    } finally {
      this.active--;
    }
  }
}
