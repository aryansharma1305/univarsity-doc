import { Injectable, Logger } from '@nestjs/common';

/**
 * Delivers password-reset links. Email infrastructure does not exist yet, so the default
 * implementation reports itself as NOT configured and the forgot-password endpoint answers
 * PASSWORD_RESET_UNAVAILABLE (503) instead of pretending an email was sent.
 *
 * When mail delivery is added, provide an implementation with `isConfigured() === true` under the
 * PASSWORD_RESET_NOTIFIER token. Implementations must never log the reset URL or token.
 */
export interface PasswordResetNotifier {
  isConfigured(): boolean;
  sendResetLink(input: {
    email: string;
    displayName: string;
    resetUrl: string;
    expiresAt: Date;
  }): Promise<void>;
}

export const PASSWORD_RESET_NOTIFIER = Symbol('PASSWORD_RESET_NOTIFIER');

@Injectable()
export class UnconfiguredPasswordResetNotifier implements PasswordResetNotifier {
  private readonly logger = new Logger('PasswordResetNotifier');

  isConfigured(): boolean {
    return false;
  }

  sendResetLink(): Promise<void> {
    this.logger.warn('Password reset delivery is not configured; no email was sent.');
    return Promise.reject(new Error('Password reset delivery is not configured'));
  }
}
