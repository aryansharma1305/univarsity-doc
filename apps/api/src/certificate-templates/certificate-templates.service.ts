import { Injectable, HttpStatus } from '@nestjs/common';
import {
  TRAINING_FIXTURES,
  trainingCertificateTemplates,
  trainingCertificateTemplate,
  renderTrainingCertificatePreview,
  syntheticTrainingCertificate,
} from '@docversity/documents';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ERROR_CODES,
  trainingCertificateTemplatesResponseSchema,
  type TrainingCertificatePreviewQuery,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/app-error.js';

@Injectable()
export class CertificateTemplatesService {
  private active = 0;
  constructor(private readonly audit: AuditService) {}
  list() {
    return trainingCertificateTemplatesResponseSchema.parse({
      templates: trainingCertificateTemplates(),
      fixtures: TRAINING_FIXTURES,
    });
  }
  async preview(query: TrainingCertificatePreviewQuery, actor: string) {
    if (this.active >= 2)
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.internalError,
        'Preview rendering is busy. Try again shortly.',
        { headers: { 'Retry-After': '5' } },
      );
    this.active++;
    try {
      const template = trainingCertificateTemplate(query.templateId, query.version);
      const rendered = await renderTrainingCertificatePreview(
        syntheticTrainingCertificate(query.fixture),
        template,
      );
      await this.audit.writeAuditEvent({
        actorUserId: actor,
        action: AUDIT_ACTIONS.trainingCertificatePreviewGenerated,
        entityType: 'SyntheticTrainingCertificatePreview',
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
