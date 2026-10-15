import { Inject, Injectable } from '@nestjs/common';
import {
  certificateApplicationPolicySchema,
  certificateReviewPolicySchema,
  type CertificateApplicationPolicy,
} from '@docversity/validation';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
@Injectable()
export class CertificatePoliciesService {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}
  // University application and review policies have not been supplied. No runtime flag bypasses this.
  definitions(): readonly unknown[] {
    return [];
  }
  reviewDefinition(): unknown {
    return null;
  }
  canComplete(type: string): boolean {
    const policy = certificateReviewPolicySchema.safeParse(this.reviewDefinition());
    return (
      this.config.NODE_ENV === 'test' &&
      policy.success &&
      policy.data.certificateTypes.some((t) => t === type)
    );
  }
  get(type: string): CertificateApplicationPolicy | null {
    for (const definition of this.definitions()) {
      const parsed = certificateApplicationPolicySchema.safeParse(definition);
      if (parsed.success && parsed.data.certificateType === type) {
        // The only implemented eligibility evaluator is isolated-test-only, never a live policy.
        if (this.config.NODE_ENV === 'test') return parsed.data;
      }
    }
    return null;
  }
}
