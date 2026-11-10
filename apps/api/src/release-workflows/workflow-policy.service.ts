import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { workflowFixturePolicySchema, ERROR_CODES, canonicalJson } from '@docversity/validation';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { AppError, Errors } from '../common/app-error.js';
export const workflowDigest = (v: unknown) =>
  createHash('sha256').update(canonicalJson(v)).digest('hex');
export const workflowConflict = () =>
  new AppError(
    HttpStatus.CONFLICT,
    ERROR_CODES.conflict,
    'This synthetic workflow changed or is unavailable. No official operation was performed.',
  );
@Injectable()
export class WorkflowPolicyService {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}
  definition(): unknown {
    return null;
  }
  current() {
    const policy = workflowFixturePolicySchema.safeParse(this.definition());
    if (this.config.NODE_ENV !== 'test' || !policy.success) throw Errors.notFound();
    return policy.data;
  }
  enabled() {
    return (
      this.config.NODE_ENV === 'test' &&
      workflowFixturePolicySchema.safeParse(this.definition()).success
    );
  }
}
