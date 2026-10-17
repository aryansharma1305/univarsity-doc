import { Injectable, HttpStatus } from '@nestjs/common';
import {
  ACADEMIC_FIXTURES,
  academicCertificateTemplate,
  academicCertificateTemplates,
  renderAcademicCertificatePreview,
  syntheticAcademicCertificate,
  TRAINING_FIXTURES,
  trainingCertificateTemplates,
  trainingCertificateTemplate,
  renderTrainingCertificatePreview,
  syntheticTrainingCertificate,
} from '@docversity/documents';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  academicCertificateTemplatesResponseSchema,
  type AcademicCertificatePreviewQuery,
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
  private reserve() {
    if (this.active >= 2)
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.internalError,
        'Preview rendering is busy. Try again shortly.',
        { headers: { 'Retry-After': '5' } },
      );
    this.active++;
  }
  listAcademic() {
    return academicCertificateTemplatesResponseSchema.parse({
      templates: academicCertificateTemplates(),
      fixtures: ACADEMIC_FIXTURES,
    });
  }
  /** Phase 12C: fixed invented records only — no student, registration, result or storage access. */
  async academicPreview(query: AcademicCertificatePreviewQuery, actor: string) {
    this.reserve();
    try {
      const template = academicCertificateTemplate(query.type, query.version);
      const rendered = await renderAcademicCertificatePreview(
        syntheticAcademicCertificate(query.type, query.fixture),
        template,
      );
      await this.audit.writeAuditEvent({
        actorUserId: actor,
        action: AUDIT_ACTIONS.academicCertificatePreviewGenerated,
        entityType: 'SyntheticAcademicCertificatePreview',
        metadata: {
          certificateType: template.type,
          templateId: template.id,
          templateVersion: template.version,
          fixture: query.fixture,
          layout: rendered.layout,
          pages: rendered.pages,
          bytes: rendered.bytes.length,
        },
      });
      return { bytes: rendered.bytes, templateId: template.id };
    } finally {
      this.active--;
    }
  }
  async preview(query: TrainingCertificatePreviewQuery, actor: string) {
    this.reserve();
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
