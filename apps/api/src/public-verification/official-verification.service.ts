import { HttpStatus, Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  officialDocumentSnapshotSchema,
  officialVerificationResponseSchema,
  type OfficialVerificationRequest,
  type OfficialVerificationResponse,
  type PublicVerificationService,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { IdentifierHasher } from '../auth/identifier-hasher.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { PrismaService } from '../database/prisma.service.js';
import { VerificationPoliciesService } from './verification-policies.service.js';
import { OfficialResultsService } from './official-results.service.js';
import { verificationUnavailable } from './public-verification.service.js';
import { AppError } from '../common/app-error.js';
@Injectable()
export class OfficialVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: VerificationPoliciesService,
    private readonly results: OfficialResultsService,
    private readonly audit: AuditService,
    private readonly hasher: IdentifierHasher,
    private readonly limiter: RateLimiter,
  ) {}
  async check(
    service: PublicVerificationService,
    input: OfficialVerificationRequest,
    ip: string,
    studentId?: string,
  ): Promise<OfficialVerificationResponse> {
    const result = (
      status: OfficialVerificationResponse['status'],
      message: string,
      fields: Partial<OfficialVerificationResponse> = {},
    ): OfficialVerificationResponse => ({
      contractVersion: 2,
      service,
      status,
      message,
      ...fields,
    });
    const referenceHash = this.hasher.hash(
      `public-verification:v2:${service}`,
      input.token ?? (input.reference ?? '').toUpperCase(),
    );
    try {
      const budget = await this.limiter.hit(
        'public-verification-reference',
        [{ key: referenceHash, limit: 10 }],
        60,
      );
      if (budget.limited)
        throw new AppError(
          HttpStatus.TOO_MANY_REQUESTS,
          'PUBLIC_VERIFICATION_RATE_LIMITED',
          'Too many requests. Please wait before trying again.',
          { headers: { 'Retry-After': String(budget.retryAfterSeconds) } },
        );
      let response: OfficialVerificationResponse;
      // Check authority before touching academic records. Production defaults to no public disclosure.
      const authorities = await this.prisma.client.verificationPolicy.findMany({
        where: { service, status: 'APPROVED' },
        take: 100,
      });
      const enabled = authorities.some((p) => this.policies.allowed(p.definition));
      if (!enabled)
        response = result(
          'UNAVAILABLE',
          'No verified record is available. University verification approval is pending.',
        );
      else if (service === 'registration' || service === 'result') {
        if (input.token)
          response = result('INVALID', 'Use your registration number and student sign in.');
        else if (!studentId)
          response = result(
            'AUTHENTICATION_REQUIRED',
            'Sign in to your student account to check this record.',
          );
        else {
          const registration = await this.prisma.client.studentRegistration.findFirst({
            where: {
              studentId,
              registrationNumberNormalized: (input.reference ?? '').toUpperCase(),
            },
            include: { program: true },
          });
          const policy = registration
            ? await this.policies.current(service, registration.programId)
            : null;
          if (!registration)
            response = result('INVALID', 'No authorized record matches these details.');
          else if (!policy)
            response = result(
              'UNAVAILABLE',
              'No verified record is available under the current university policy.',
            );
          else if (service === 'registration')
            response = result(
              registration.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
              registration.status === 'ACTIVE'
                ? 'This registration is verified.'
                : 'This registration is inactive or suspended.',
              {
                maskedReference: mask(registration.registrationNumber),
                ...(policy.definition.discloseProgram
                  ? { program: registration.program.name }
                  : {}),
              },
            );
          else {
            const rows = await this.results.list(studentId, {
              registrationId: registration.id,
              periodNumber: input.periodNumber,
              examinationId: input.examinationId,
            });
            response = rows.length
              ? result('VALID', 'Official published results are available.', { results: rows })
              : result(
                  'UNPUBLISHED',
                  'No approved, published result is available for this selection.',
                );
          }
        }
      } else {
        if (input.periodNumber || input.examinationId)
          response = result('INVALID', 'Use only the document number or its secure QR token.');
        else {
          const c = await this.prisma.client.certificate.findFirst({
            where: {
              ...(input.token
                ? { verificationToken: input.token }
                : { certificateNumber: input.reference }),
              documentType:
                service === 'admission-letter' ? 'ADMISSION_LETTER' : { not: 'ADMISSION_LETTER' },
              status: { in: ['ISSUED', 'REVOKED', 'SUPERSEDED'] },
            },
          });
          const snapshot = officialDocumentSnapshotSchema.safeParse(c?.sourceSnapshot);
          const policy =
            c && snapshot.success
              ? await this.policies.current(
                  service,
                  c.programId,
                  this.prisma.client,
                  snapshot.data.policyId,
                )
              : null;
          if (
            !c ||
            !snapshot.success ||
            !policy ||
            snapshot.data.registrationId !== c.studentRegistrationId ||
            snapshot.data.templateId !== c.certificateTemplateId ||
            !c.generatedByUserId ||
            !c.approvedByUserId ||
            c.generatedByUserId === c.approvedByUserId ||
            !c.approvedAt ||
            !c.issuedByUserId ||
            !c.issuedAt ||
            !c.pdfHash ||
            !c.pdfStorageKey ||
            !c.verificationToken
          )
            response = result('NOT_FOUND', 'No approved, issued document matches these details.');
          else if (c.status !== 'ISSUED')
            response = result('REVOKED', 'This document has been revoked or replaced.');
          else
            response = result(
              service === 'certificate' ? 'ISSUED' : 'VALID',
              'This officially issued document is valid.',
              {
                documentType: c.documentType,
                institution: snapshot.data.institutionName,
                maskedReference: mask(c.certificateNumber ?? ''),
                ...(policy.definition.discloseProgram
                  ? { program: snapshot.data.programName }
                  : {}),
                ...(policy.definition.discloseIssueDate && c.issueDate
                  ? { issueDate: c.issueDate.toISOString().slice(0, 10) }
                  : {}),
              },
            );
        }
      }
      await this.audit.writeAuditEvent({
        action: AUDIT_ACTIONS.publicVerificationChecked,
        entityType: 'public_verification',
        metadata: {
          contractVersion: 2,
          service,
          outcome: response.status,
          referenceHash,
          clientHash: this.hasher.hash('public-verification:client', ip),
        },
      });
      return officialVerificationResponseSchema.parse(response);
    } catch (error) {
      if (error instanceof AppError && error.status === HttpStatus.TOO_MANY_REQUESTS) throw error;
      throw verificationUnavailable();
    }
  }
}
function mask(s: string) {
  return `••••${s.length > 4 ? s.slice(-4) : s.slice(-1)}`;
}
