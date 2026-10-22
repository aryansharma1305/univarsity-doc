import { HttpStatus, Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  PUBLIC_VERIFICATION_UNAVAILABLE,
  normalizeVerificationReference,
  type PublicVerificationRequest,
  type PublicVerificationService,
  type UnavailableVerificationResponse,
} from '@docversity/validation';
import { IdentifierHasher } from '../auth/identifier-hasher.js';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/app-error.js';

export function verificationUnavailable() {
  return new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    'PUBLIC_VERIFICATION_UNAVAILABLE',
    'Public verification is temporarily unavailable. No record has been checked.',
  );
}

@Injectable()
export class PublicVerificationServiceHandler {
  constructor(
    private readonly audit: AuditService,
    private readonly hasher: IdentifierHasher,
  ) {}

  async check(
    service: PublicVerificationService,
    input: PublicVerificationRequest,
    clientIp: string,
  ): Promise<UnavailableVerificationResponse> {
    // No record/storage lookup or activation flag: policy/provenance must be implemented first.
    try {
      await this.audit.writeAuditEvent({
        action: AUDIT_ACTIONS.publicVerificationUnavailable,
        entityType: 'public_verification',
        metadata: {
          contractVersion: 1,
          service,
          outcome: 'UNAVAILABLE',
          referenceHash: this.hasher.hash(
            `public-verification:v1:${service}`,
            normalizeVerificationReference(service, input.reference),
          ),
          clientHash: this.hasher.hash('public-verification:client', clientIp),
        },
      });
    } catch {
      throw verificationUnavailable();
    }
    return {
      contractVersion: 1,
      service,
      status: 'UNAVAILABLE',
      message: PUBLIC_VERIFICATION_UNAVAILABLE,
    };
  }
}
