import { HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type StaffNextStep } from '@docversity/validation';
import { AppError } from '../common/app-error.js';
import type { ApiConfig } from '../config/api-config.js';
import type { UserForAuth } from '../users/users.service.js';
import type { SessionRecord } from './session.store.js';

/**
 * The single step a staff session must complete before it is a full session, in order:
 * 1. MFA_VERIFY — password verified, authenticator code still pending (session stage `mfa`);
 * 2. PASSWORD_CHANGE — first login after CLI creation, or after an access reset;
 * 3. MFA_ENROLL — MFA is enforced (STAFF_MFA_ENFORCED) and the account has no authenticator yet.
 * Derived on EVERY request from the session record and the freshly loaded user, so clearing a flag or
 * switching enforcement on takes effect immediately.
 */
export function staffNextStep(
  record: Pick<SessionRecord, 'stage'>,
  user: Pick<UserForAuth, 'passwordChangeRequired' | 'mfaEnabled'>,
  config: Pick<ApiConfig, 'STAFF_MFA_ENFORCED'>,
): StaffNextStep | null {
  if (record.stage === 'mfa') return 'MFA_VERIFY';
  if (user.passwordChangeRequired) return 'PASSWORD_CHANGE';
  if (config.STAFF_MFA_ENFORCED && !user.mfaEnabled) return 'MFA_ENROLL';
  return null;
}

export function stepRequiredError(step: StaffNextStep): AppError {
  switch (step) {
    case 'PASSWORD_CHANGE':
      return new AppError(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.passwordChangeRequired,
        'Choose a new password before continuing.',
      );
    case 'MFA_VERIFY':
      return new AppError(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.mfaRequired,
        'Enter the code from your authenticator app to finish signing in.',
      );
    case 'MFA_ENROLL':
      return new AppError(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.mfaEnrollmentRequired,
        'Set up two-step verification before continuing.',
      );
  }
}
