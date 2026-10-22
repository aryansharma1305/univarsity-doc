import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AcademicSampleIntegrityError, academicCertificateSample } from '@docversity/documents';
import {
  ACADEMIC_TEMPLATE_IDS,
  ERROR_CODES,
  academicSampleCertificateType,
  type AcademicCertificateSampleId,
} from '@docversity/validation';
import { AppError, Errors } from '../common/app-error.js';
import { CertificateEligibilityService } from './certificate-eligibility.service.js';

/**
 * Phase 12C.1: serves a fixed synthetic academic sample for one of the signed-in student's own
 * registrations, only when that certificate type is approved for the registration's course under the
 * current policy. Every decision is made here from the server's own data: the certificate type comes
 * from the sample identifier, eligibility from the same resolver as the student eligibility contract.
 * Pending, withdrawn, out-of-date, not-offered and unresolved types, and other students'
 * registrations, are indistinguishable from a missing sample (404).
 */
@Injectable()
export class AcademicSamplesService {
  private readonly logger = new Logger(AcademicSamplesService.name);
  constructor(private readonly eligibility: CertificateEligibilityService) {}

  /** Verified pinned bytes (hash, size, header and identity are checked by the loader). */
  load(sampleId: AcademicCertificateSampleId, certificateType: string): Buffer {
    return academicCertificateSample(sampleId, certificateType);
  }

  async sample(studentId: string, registrationId: string, sampleId: AcademicCertificateSampleId) {
    const certificateType = academicSampleCertificateType(sampleId);
    // Throws 404 when the registration is not the signed-in student's own.
    const { registration } = await this.eligibility.studentRegistrationEligibility(
      studentId,
      registrationId,
    );
    const item = registration.certificates.find((c) => c.certificateType === certificateType);
    const approved =
      item?.typeEligibility === 'APPROVED_FOR_COURSE' &&
      item.samplePreviewAllowed &&
      item.samplePreviewTemplate?.templateId === ACADEMIC_TEMPLATE_IDS[certificateType] &&
      item.samplePreviewTemplate.version === 1;
    if (!approved) throw Errors.notFound();
    try {
      return this.load(sampleId, certificateType);
    } catch (error) {
      if (error instanceof AcademicSampleIntegrityError) {
        // Safe diagnostics only: a pinned identifier (or "(unknown)") and the failed check.
        this.logger.error({
          event: 'academic_sample_integrity_failure',
          sampleId: error.sampleId,
          check: error.check,
        });
        throw new AppError(
          HttpStatus.SERVICE_UNAVAILABLE,
          ERROR_CODES.serviceUnavailable,
          'This sample is temporarily unavailable.',
        );
      }
      throw error;
    }
  }
}
