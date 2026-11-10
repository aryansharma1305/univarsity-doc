import { z } from 'zod';
const text = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((v) =>
    Array.from(v).every((c) => c.charCodeAt(0) >= 32 || [9, 10, 13].includes(c.charCodeAt(0))),
  );
export const workflowFixturePolicySchema = z
  .object({
    contractVersion: z.literal(1),
    usage: z.literal('SYNTHETIC_ONLY'),
    fixtureReference: z.string().min(3).max(128),
    registrationIds: z.array(z.uuid()).min(1).max(100),
    gatewaySecret: z.string().min(32).max(128),
  })
  .strict();
export const workflowCommandSchema = z
  .object({
    requestId: z.uuid(),
    version: z.number().int().positive(),
    confirmed: z.literal(true),
    message: text.optional(),
  })
  .strict();
export const prepareReleaseSchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(['RESULT', 'REGISTRATION', 'ADMISSION_LETTER']),
    registrationId: z.uuid(),
    resultId: z.uuid().optional(),
    confirmed: z.literal(true),
  })
  .strict()
  .superRefine((v, c) => {
    if ((v.kind === 'RESULT') !== Boolean(v.resultId))
      c.addIssue({
        code: 'custom',
        path: ['resultId'],
        message: 'Only result releases require a result identifier.',
      });
  });
export const syntheticPublishedResultSchema = z
  .object({
    id: z.uuid(),
    resultId: z.uuid(),
    registrationId: z.uuid(),
    usage: z.literal('SYNTHETIC_ONLY'),
    label: z.literal('SAMPLE — not an official result'),
    examination: z.string().max(200),
    attemptNumber: z.number().int().positive(),
    periodNumber: z.number().int().positive(),
    sgpa: z.string().max(16).nullable(),
    outcome: z.string().max(32),
    subjects: z
      .array(
        z
          .object({
            programSubjectId: z.uuid(),
            code: z.string().max(64),
            name: z.string().max(200),
            totalMarks: z.string().max(16).nullable(),
            maxMarks: z.string().max(16),
            grade: z.string().max(8).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    publishedAt: z.iso.datetime(),
  })
  .strict();
export const submitRetotalingSchema = z
  .object({ releaseId: z.uuid(), submissionKey: z.uuid(), reason: text })
  .strict();
export const retotalingReceiptSchema = z
  .object({
    id: z.uuid(),
    registrationId: z.uuid(),
    releaseId: z.uuid(),
    reason: text,
    status: z.enum([
      'SUBMITTED',
      'INFORMATION_REQUESTED',
      'INFORMATION_PROVIDED',
      'CANCELLED',
      'CLOSED',
    ]),
    version: z.number().int().positive(),
    usage: z.literal('SYNTHETIC_ONLY'),
    feeStatus: z.literal('NOT_CONFIGURED'),
    academicDecision: z.literal('NONE'),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const legacyRecoverySchema = z
  .object({
    requestId: z.uuid(),
    planDigest: z.string().regex(/^[a-f0-9]{64}$/),
    expectedCheckpoint: z.number().int().min(0).max(1000),
  })
  .strict();
export type LegacyRecovery = z.infer<typeof legacyRecoverySchema>;
export const sandboxOrderSchema = z.object({ requestId: z.uuid(), paymentId: z.uuid() }).strict();
export const sandboxCallbackSchema = z
  .object({
    payloadBase64: z
      .string()
      .min(4)
      .max(22000)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    timestamp: z.string().regex(/^\d{10}$/),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const sandboxRefundSchema = z
  .object({
    requestId: z.uuid(),
    amountMinor: z.number().int().positive().max(1_000_000_000),
    confirmed: z.literal(true),
  })
  .strict();
export const syntheticLookupSchema = z
  .object({
    service: z.enum(['result', 'registration', 'certificate', 'admission-letter']),
    reference: z
      .string()
      .min(3)
      .max(128)
      .regex(/^[A-Za-z0-9._-]+$/),
  })
  .strict();
export const legacyDryRunSchema = z
  .object({
    id: z.uuid(),
    usage: z.literal('SYNTHETIC_ONLY'),
    sourceSystem: z.string().regex(/^SYNTHETIC_[A-Z0-9_]{1,40}$/),
    records: z
      .array(
        z
          .object({
            sourceId: z.string().min(1).max(128),
            entity: z.enum([
              'REGISTRATION',
              'SUBJECT',
              'RESULT',
              'CERTIFICATE',
              'ADMISSION_LETTER',
            ]),
            naturalKey: z.string().min(1).max(128),
            references: z.array(z.string().min(1).max(128)).max(20),
            values: z.record(
              z.string().max(64),
              z.union([z.string().max(500), z.number(), z.null()]),
            ),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type WorkflowCommand = z.infer<typeof workflowCommandSchema>;
export type PrepareRelease = z.infer<typeof prepareReleaseSchema>;
export type SubmitRetotaling = z.infer<typeof submitRetotalingSchema>;
export type SandboxOrder = z.infer<typeof sandboxOrderSchema>;
export type SandboxCallback = z.infer<typeof sandboxCallbackSchema>;
export type SandboxRefund = z.infer<typeof sandboxRefundSchema>;
export type LegacyDryRun = z.infer<typeof legacyDryRunSchema>;
