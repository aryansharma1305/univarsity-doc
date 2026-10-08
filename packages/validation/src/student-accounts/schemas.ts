import { z } from 'zod';
import {
  listQuerySchema,
  optionalFilter,
  paginatedSchema,
  refSchema,
  studentStatusSchema,
} from '../academic/common.js';

/**
 * Activation codes: 12 characters from a 32-symbol alphabet without look-alikes (no I, O, 0, 1) —
 * 60 bits of entropy — shown to people as XXXX-XXXX-XXXX. Input is normalised (case, spaces and
 * dashes ignored) before it is checked.
 */
export const ACTIVATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACTIVATION_CODE_LENGTH = 12;

export function normalizeActivationCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

export function formatActivationCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

const activationCodeInput = z
  .string()
  .max(40)
  .transform(normalizeActivationCode)
  .pipe(
    z
      .string()
      .length(ACTIVATION_CODE_LENGTH, 'Enter the 12-character activation code.')
      .regex(
        new RegExp(`^[${ACTIVATION_CODE_ALPHABET}]+$`),
        'Enter the activation code exactly as printed.',
      ),
  );

const registrationNumberInput = z
  .string()
  .trim()
  .min(1, 'Enter your registration number.')
  .max(64, 'Use at most 64 characters.');

const passwordInput = z.string().min(1, 'Enter a password.').max(256);

export const studentActivateRequestSchema = z
  .object({
    registrationNumber: registrationNumberInput,
    activationCode: activationCodeInput,
    password: passwordInput,
  })
  .strict()
  .meta({ id: 'StudentActivateRequest' });

export const studentLoginRequestSchema = z
  .object({ registrationNumber: registrationNumberInput, password: passwordInput })
  .strict()
  .meta({ id: 'StudentLoginRequest' });

export const studentAccountStatusSchema = z.enum(['ACTIVE', 'LOCKED', 'DISABLED']);

/** What a signed-in student may see about themselves: their own record and registrations only. */
export const studentMeSchema = z
  .object({
    account: z.object({
      id: z.uuid(),
      status: studentAccountStatusSchema,
      activatedAt: z.iso.datetime(),
    }),
    student: z.object({
      id: z.uuid(),
      fullName: z.string(),
      fatherName: z.string().nullable(),
      motherName: z.string().nullable(),
      dateOfBirth: z.iso.date().nullable(),
      gender: z.string().nullable(),
      hasPhoto: z.boolean(),
    }),
    registrations: z.array(
      z.object({
        id: z.uuid(),
        registrationNumber: z.string(),
        rollReferenceNumber: z.string().nullable(),
        program: refSchema,
        department: refSchema.nullable(),
        academicSession: refSchema,
        admissionDate: z.iso.date().nullable(),
        completionDate: z.iso.date().nullable(),
        status: studentStatusSchema,
      }),
    ),
  })
  .meta({ id: 'StudentMe' });

export type StudentActivateRequest = z.infer<typeof studentActivateRequestSchema>;
export type StudentActivateInput = z.input<typeof studentActivateRequestSchema>;
export type StudentLoginRequest = z.infer<typeof studentLoginRequestSchema>;
export type StudentAccountStatus = z.infer<typeof studentAccountStatusSchema>;
export type StudentMe = z.infer<typeof studentMeSchema>;

// ------------------------------------------------------------------------------------------
// Staff administration of student accounts
// ------------------------------------------------------------------------------------------

/** Portal state of a registration's student. */
export const portalStateSchema = z.enum([
  'NO_ACCOUNT',
  'CODE_ISSUED',
  'CODE_EXPIRED',
  'ACTIVE',
  'LOCKED',
  'DISABLED',
]);

export const studentAccountRowSchema = z
  .object({
    registrationId: z.uuid(),
    registrationNumber: z.string(),
    studentId: z.uuid(),
    studentName: z.string(),
    program: refSchema,
    academicSession: refSchema,
    registrationStatus: studentStatusSchema,
    state: portalStateSchema,
    account: z
      .object({
        id: z.uuid(),
        status: studentAccountStatusSchema,
        statusReason: z.string().nullable(),
        activatedAt: z.iso.datetime(),
        lastLoginAt: z.iso.datetime().nullable(),
      })
      .nullable(),
    openCode: z.object({ issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime() }).nullable(),
  })
  .meta({ id: 'StudentAccountRow' });

export const studentAccountListSchema = paginatedSchema(studentAccountRowSchema).meta({
  id: 'StudentAccountList',
});

export const STUDENT_ACCOUNT_SORT_FIELDS = ['registrationNumber', 'studentName'] as const;
export const studentAccountQuerySchema = listQuerySchema(
  STUDENT_ACCOUNT_SORT_FIELDS,
  'registrationNumber',
  {
    state: optionalFilter(portalStateSchema),
    programId: optionalFilter(z.uuid()),
    academicSessionId: optionalFilter(z.uuid()),
    /** Registrations created or updated by this import. */
    importJobId: optionalFilter(z.uuid()),
  },
);

/** Either explicit registrations (≤ 500) or every eligible registration of one import. */
export const issueActivationCodesSchema = z
  .object({
    registrationIds: z.array(z.uuid()).min(1).max(500).optional(),
    importJobId: z.uuid().optional(),
  })
  .strict()
  .refine((value) => (value.registrationIds ? 1 : 0) + (value.importJobId ? 1 : 0) === 1, {
    message: 'Choose registrations or an import.',
  })
  .meta({ id: 'IssueActivationCodes' });

export const issuedActivationCodesSchema = z
  .object({
    issued: z.array(
      z.object({
        registrationId: z.uuid(),
        registrationNumber: z.string(),
        studentName: z.string(),
        programCode: z.string(),
        /** Formatted XXXX-XXXX-XXXX. Returned ONCE; only a hash is stored. */
        code: z.string(),
        expiresAt: z.iso.datetime(),
      }),
    ),
    skipped: z.array(
      z.object({ registrationId: z.uuid(), registrationNumber: z.string(), reason: z.string() }),
    ),
  })
  .meta({ id: 'IssuedActivationCodes' });

export const revokeActivationCodesSchema = z
  .object({ registrationIds: z.array(z.uuid()).min(1).max(500) })
  .strict()
  .meta({ id: 'RevokeActivationCodes' });

export const setStudentAccountStatusSchema = z
  .object({
    status: studentAccountStatusSchema,
    reason: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().max(500).nullable().default(null),
    ),
  })
  .strict()
  .refine((value) => value.status !== 'DISABLED' || value.reason !== null, {
    message: 'Give a reason for disabling the account.',
    path: ['reason'],
  })
  .meta({ id: 'SetStudentAccountStatus' });

export type PortalState = z.infer<typeof portalStateSchema>;
export type StudentAccountRow = z.infer<typeof studentAccountRowSchema>;
export type StudentAccountList = z.infer<typeof studentAccountListSchema>;
export type StudentAccountQuery = z.infer<typeof studentAccountQuerySchema>;
export type IssueActivationCodes = z.infer<typeof issueActivationCodesSchema>;
export type IssuedActivationCodes = z.infer<typeof issuedActivationCodesSchema>;
export type RevokeActivationCodes = z.infer<typeof revokeActivationCodesSchema>;
export type SetStudentAccountStatus = z.infer<typeof setStudentAccountStatusSchema>;
export type SetStudentAccountStatusInput = z.input<typeof setStudentAccountStatusSchema>;
