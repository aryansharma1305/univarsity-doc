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

/** The only user shape the API ever returns: no password hash, no session data. */
export const authUserSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    displayName: z.string(),
    roles: z.array(z.string()),
    permissions: z.array(z.string()),
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
