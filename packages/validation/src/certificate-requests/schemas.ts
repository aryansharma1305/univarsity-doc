import { z } from 'zod';
export const certificateTypeSchema = z.enum([
  'TRANSCRIPT',
  'PROVISIONAL',
  'CHARACTER',
  'MIGRATION',
]);
export const certificateRequestStatusSchema = z.enum([
  'SUBMITTED',
  'UNDER_REVIEW',
  'INFORMATION_REQUESTED',
  'INFORMATION_PROVIDED',
  'REVIEW_COMPLETED',
  'CANCELLED',
  'CLOSED',
]);
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (v) =>
        Array.from(v).every((c) => c.charCodeAt(0) >= 32 || [9, 10, 13].includes(c.charCodeAt(0))),
      'Unsupported control characters',
    );
export const certificateApplicationPolicySchema = z
  .object({
    id: text(128),
    version: z.number().int().positive(),
    certificateType: certificateTypeSchema,
    authorityReference: text(200),
    approved: z.literal(true),
    submissionEnabled: z.literal(true),
    eligibilityRule: z.literal('SYNTHETIC_TEST_ONLY'),
    eligibilityReference: text(200),
    fields: z.object({ purposeRequired: z.boolean(), remarksAllowed: z.boolean() }).strict(),
    evidence: z.object({ requirement: z.literal('NONE'), authorityReference: text(200) }).strict(),
    fee: z
      .object({ kind: z.literal('APPROVED_EXEMPTION'), authorityReference: text(200) })
      .strict(),
    actions: z
      .array(z.enum(['SUBMIT', 'RESPOND', 'CANCEL']))
      .min(1)
      .refine((v) => v.includes('SUBMIT') && new Set(v).size === v.length),
  })
  .strict();
export const certificateReviewPolicySchema = z
  .object({
    id: text(128),
    authorityReference: text(200),
    approved: z.literal(true),
    certificateTypes: z.array(certificateTypeSchema).min(1),
    action: z.literal('COMPLETE_REVIEW'),
  })
  .strict();
export type CertificateApplicationPolicy = z.infer<typeof certificateApplicationPolicySchema>;
export const submitCertificateRequestSchema = z
  .object({
    certificateType: certificateTypeSchema,
    submissionKey: z.uuid(),
    purpose: z
      .string()
      .trim()
      .max(1000)
      .refine(
        (v) =>
          Array.from(v).every(
            (c) => c.charCodeAt(0) >= 32 || [9, 10, 13].includes(c.charCodeAt(0)),
          ),
        'Unsupported control characters',
      ),
    remarks: text(2000).optional(),
  })
  .strict();
export const certificateTransitionSchema = z
  .object({
    version: z.number().int().positive(),
    message: text(2000).optional(),
    privateNote: text(2000).optional(),
  })
  .strict();
export const certificateResponseSchema = z
  .object({ version: z.number().int().positive(), message: text(2000) })
  .strict();
export const certificateVersionSchema = z.object({ version: z.number().int().positive() }).strict();
export const certificateRequestQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    status: certificateRequestStatusSchema.optional(),
    certificateType: certificateTypeSchema.optional(),
    search: z.string().trim().max(100).optional(),
  })
  .strict();
export const certificateEventSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    status: certificateRequestStatusSchema,
    action: z.string(),
    studentMessage: z.string().nullable(),
    createdAt: z.iso.datetime(),
    privateNote: z.string().nullable().optional(),
  })
  .strict();
export const certificateRequestSchema = z
  .object({
    id: z.uuid(),
    reference: z.string(),
    certificateType: certificateTypeSchema,
    status: certificateRequestStatusSchema,
    version: z.number().int().positive(),
    purpose: z.string(),
    remarks: z.string().nullable(),
    submittedAt: z.iso.datetime(),
    policyId: z.string(),
    policyVersion: z.number().int(),
    paymentStatus: z.literal('NOT_AVAILABLE'),
    approvalStatus: z.literal('NOT_AVAILABLE'),
    issuanceStatus: z.literal('NOT_AVAILABLE'),
    nextAction: z.string(),
    canRespond: z.boolean(),
    canCancel: z.boolean(),
    canReview: z.boolean(),
    canCompleteReview: z.boolean(),
    student: z.object({ name: z.string(), registrations: z.array(z.string()) }).optional(),
    events: z.array(certificateEventSchema).optional(),
  })
  .strict();
export const certificateRequestListSchema = z
  .object({
    data: z.array(certificateRequestSchema),
    meta: z.object({
      page: z.number(),
      pageSize: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
    counts: z.record(certificateRequestStatusSchema, z.number()),
  })
  .strict();
export const certificateServiceListSchema = z
  .object({
    data: z.array(
      z
        .object({
          certificateType: certificateTypeSchema,
          title: z.string(),
          description: z.string(),
          available: z.boolean(),
          reason: z.string(),
          purposeRequired: z.boolean(),
          remarksAllowed: z.boolean(),
          policyId: z.string().nullable(),
          policyVersion: z.number().nullable(),
        })
        .strict(),
    ),
    corrections: z.object({ available: z.literal(false), reason: z.string() }).strict(),
  })
  .strict();
export type CertificateRequestDetail = z.infer<typeof certificateRequestSchema>;
export type CertificateRequestQuery = z.infer<typeof certificateRequestQuerySchema>;
export type SubmitCertificateRequest = z.infer<typeof submitCertificateRequestSchema>;
export type CertificateTransition = z.infer<typeof certificateTransitionSchema>;
