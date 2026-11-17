import { z } from 'zod';
import { newPasswordSchema } from './password-policy.js';

/** Emails are compared lower-case and trimmed (matches the users_email_check constraint). */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address.' }).max(254));

/** Login accepts any non-empty password; the policy applies only when a password is set. */
export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'Enter your password.').max(1024),
  })
  .meta({ id: 'LoginRequest' });

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: newPasswordSchema,
  })
  .meta({ id: 'ChangePasswordRequest' });

export const forgotPasswordRequestSchema = z
  .object({ email: emailSchema })
  .meta({ id: 'ForgotPasswordRequest' });

export const resetPasswordRequestSchema = z
  .object({
    token: z.string().min(32).max(256),
    newPassword: newPasswordSchema,
  })
  .meta({ id: 'ResetPasswordRequest' });

export const STAFF_NEXT_STEPS = ['PASSWORD_CHANGE', 'MFA_VERIFY', 'MFA_ENROLL'] as const;
export const staffNextStepSchema = z.enum(STAFF_NEXT_STEPS);
export type StaffNextStep = z.infer<typeof staffNextStepSchema>;

/** The only user shape the API ever returns: no password hash, no session data. */
export const authUserSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    displayName: z.string(),
    roles: z.array(z.string()),
    permissions: z.array(z.string()),
    /** Whether the account has a confirmed authenticator app. */
    mfaEnabled: z.boolean().optional(),
    /**
     * Set while the session is restricted: the only thing it can do is this step (plus me, csrf and
     * logout). `MFA_VERIFY` sessions also report no roles or permissions.
     */
    nextStep: staffNextStepSchema.nullable().optional(),
  })
  .meta({ id: 'AuthUser' });

export const csrfTokenResponseSchema = z
  .object({ csrfToken: z.string() })
  .meta({ id: 'CsrfTokenResponse' });

export const sessionSummarySchema = z
  .object({
    id: z.string().meta({ description: 'Public session handle. Not the session secret.' }),
    createdAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().meta({
      description:
        'When the session ends if it stays active (absolute or idle limit, whichever is sooner).',
    }),
    device: z.string().nullable(),
    current: z.boolean(),
  })
  .meta({ id: 'SessionSummary' });

export const sessionListResponseSchema = z
  .object({ sessions: z.array(sessionSummarySchema) })
  .meta({ id: 'SessionListResponse' });

export const okResponseSchema = z.object({ ok: z.literal(true) }).meta({ id: 'OkResponse' });

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

// ---------------------------------------------------------------------------------------------
// Staff MFA (RFC 6238 TOTP) and staff access management
// ---------------------------------------------------------------------------------------------

/** A 6-digit authenticator code; spaces are ignored ("123 456"). */
export const totpCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.'));

/** A recovery code as printed (XXXXX-XXXXX); case, spaces and hyphens are ignored. */
export const recoveryCodeSchema = z
  .string()
  .max(64)
  .transform((value) => value.replace(/[\s-]+/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z2-7]{10}$/, 'Enter a recovery code exactly as printed.'));

export const mfaEnrollmentStartResponseSchema = z
  .object({
    /** Base32 secret for manual entry. Shown once; never retrievable after enrollment. */
    secret: z.string(),
    otpauthUri: z.string(),
    /** The otpauth URI as an SVG QR code (data: URL). */
    qrSvgDataUrl: z.string(),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: 'MfaEnrollmentStartResponse' });

/**
 * Confirming enrollment binds a new second factor to the account, so it re-authenticates: the current
 * password is required (checked with Argon2 and throttled like sign-in), not just a live session.
 */
export const mfaEnrollmentConfirmRequestSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(1024),
    code: totpCodeSchema,
  })
  .meta({ id: 'MfaEnrollmentConfirmRequest' });

export const mfaEnrollmentConfirmResponseSchema = z
  .object({
    /** One-time recovery codes. Shown once; only keyed hashes are stored. */
    recoveryCodes: z.array(z.string()),
    /**
     * MFA is enabled either way. `true` = the session could not be rotated (the old session is
     * revoked and no new one exists): show the codes, then send the user to sign in again.
     */
    reauthenticate: z.boolean(),
    /** The signed-in user on the rotated session; `null` exactly when `reauthenticate` is true. */
    user: authUserSchema.nullable(),
  })
  .meta({ id: 'MfaEnrollmentConfirmResponse' });

/** Second sign-in step: either a current authenticator code or one unused recovery code. */
export const mfaVerifyRequestSchema = z
  .object({ code: totpCodeSchema.optional(), recoveryCode: recoveryCodeSchema.optional() })
  .strict()
  .refine((value) => (value.code === undefined) !== (value.recoveryCode === undefined), {
    message: 'Send either an authenticator code or a recovery code.',
  })
  .meta({ id: 'MfaVerifyRequest' });

export const staffUserSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    displayName: z.string(),
    roles: z.array(z.string()),
    status: z.enum(['ACTIVE', 'DISABLED']),
    mfaEnabled: z.boolean(),
    passwordChangeRequired: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'StaffUser' });

export const staffUserListResponseSchema = z
  .object({ data: z.array(staffUserSchema) })
  .meta({ id: 'StaffUserList' });

/**
 * SUPER_ADMIN reset of another staff member: removes their authenticator and recovery codes, requires
 * a new password at next sign-in and ends every session. The temporary password (handed over out of
 * band) is REQUIRED and always replaces the current one, so whoever knew the old password — possibly
 * the reason for the reset — cannot sign in afterwards.
 */
export const staffAccessResetRequestSchema = z
  .object({ temporaryPassword: newPasswordSchema })
  .strict()
  .meta({ id: 'StaffAccessResetRequest' });

/** Why an account is disabled — a code, never free text (audit metadata holds no personal values). */
export const STAFF_DISABLE_REASONS = [
  'DEMO_ACCOUNT_RETIRED',
  'LEFT_ORGANISATION',
  'SECURITY_CONCERN',
  'OTHER',
] as const;

export const staffDisableRequestSchema = z
  .object({ reason: z.enum(STAFF_DISABLE_REASONS) })
  .strict()
  .meta({ id: 'StaffDisableRequest' });

export type MfaEnrollmentStartResponse = z.infer<typeof mfaEnrollmentStartResponseSchema>;
export type MfaEnrollmentConfirmRequest = z.infer<typeof mfaEnrollmentConfirmRequestSchema>;
export type MfaEnrollmentConfirmResponse = z.infer<typeof mfaEnrollmentConfirmResponseSchema>;
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;
export type StaffUser = z.infer<typeof staffUserSchema>;
export type StaffAccessResetRequest = z.infer<typeof staffAccessResetRequestSchema>;
export type StaffDisableRequest = z.infer<typeof staffDisableRequestSchema>;
