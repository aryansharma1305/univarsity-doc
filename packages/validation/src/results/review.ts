import { z } from 'zod';
import { draftIssueSchema, draftMarksSchema } from './drafts.js';
export const reviewStates = [
  'DRAFT',
  'UNDER_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'WITHHELD',
  'SUPERSEDED',
] as const;
export const reviewQuerySchema = z
  .object({
    examinationId: z.uuid().optional(),
    programId: z.uuid().optional(),
    curriculumId: z.uuid().optional(),
    academicSessionId: z.uuid().optional(),
    periodNumber: z.coerce.number().int().min(1).optional(),
    programSubjectId: z.uuid().optional(),
    status: z.enum(reviewStates).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export const reviewActionSchema = z
  .object({
    requestId: z.uuid(),
    expectedVersion: z.number().int().min(1),
    reason: z.string().trim().min(1).max(1000).optional(),
    confirmed: z.literal(true),
  })
  .strict();
export const reviewPolicySchema = z.object({
  approvalEnabled: z.boolean(),
  makerCheckerRequired: z.boolean(),
  publicationEnabled: z.literal(false),
  publicationBlockers: z.array(z.string()),
  approvalBlockers: z.array(z.string()),
});
export const reviewSubjectSchema = z.object({
  id: z.uuid(),
  programSubjectId: z.uuid(),
  subjectCode: z.string(),
  subjectName: z.string(),
  marks: draftMarksSchema,
  reExamApplicationId: z.uuid().nullable(),
  origin: z.enum(['MANUAL', 'EXCEL', 'LEGACY']),
  batchId: z.uuid().nullable(),
  issues: z.array(draftIssueSchema),
});
export const reviewHistorySchema = z.object({
  id: z.uuid(),
  actorUserId: z.uuid(),
  actorName: z.string(),
  action: z.string(),
  fromStatus: z.enum(reviewStates),
  toStatus: z.enum(reviewStates),
  version: z.number().int(),
  createdAt: z.string(),
  reason: z.string().nullable(),
  snapshotDigest: z.string(),
});
export const reviewedResultSchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  status: z.enum(reviewStates),
  registrationId: z.uuid(),
  registrationNumber: z.string(),
  studentName: z.string(),
  examinationId: z.uuid(),
  examinationName: z.string(),
  programId: z.uuid(),
  curriculumId: z.uuid().nullable(),
  academicSessionId: z.uuid(),
  periodNumber: z.number().int(),
  structure: z.string(),
  attemptNumber: z.number().int(),
  revisionNumber: z.number().int(),
  subjects: z.array(reviewSubjectSchema),
  issues: z.array(draftIssueSchema),
  history: z.array(reviewHistorySchema),
  policy: reviewPolicySchema,
});
export const reviewQueueSchema = z.object({
  items: z.array(reviewedResultSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});
export const reviewReceiptSchema = z.object({
  requestId: z.uuid(),
  resultId: z.uuid(),
  version: z.number().int(),
  status: z.enum(reviewStates),
});
export type ReviewQuery = z.infer<typeof reviewQuerySchema>;
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type ReviewedResult = z.infer<typeof reviewedResultSchema>;
export const reviewVersionSchema = z.object({
  id: z.uuid(),
  resultId: z.uuid(),
  version: z.number().int(),
  snapshotDigest: z.string(),
  subjects: z.array(
    z.object({
      id: z.uuid(),
      programSubjectId: z.uuid(),
      subjectCode: z.string(),
      subjectName: z.string(),
      marks: draftMarksSchema,
    }),
  ),
});
