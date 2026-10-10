import { z } from 'zod';
import { resultPreviewContextSchema } from '../imports/result-preview.js';

export const DRAFT_MARK_FIELDS = [
  'internalMarks',
  'externalMarks',
  'practicalMarks',
  'otherMarks',
  'totalMarks',
] as const;
const mark = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Use a non-negative number with at most two decimals.')
  .refine((v) => Number(v) < 10000, 'Marks must be below 10000.')
  .nullable();
export const draftMarksSchema = z
  .object({
    internalMarks: mark,
    externalMarks: mark,
    practicalMarks: mark,
    otherMarks: mark,
    totalMarks: mark,
  })
  .strict();
export const saveDraftSchema = z
  .object({
    context: resultPreviewContextSchema,
    registrationId: z.uuid(),
    programSubjectId: z.uuid(),
    reExamApplicationId: z.uuid().nullable(),
    expectedVersion: z.number().int().min(1).nullable(),
    marks: draftMarksSchema,
  })
  .strict();
export const draftLookupSchema = resultPreviewContextSchema.extend({
  registrationNumber: z.string().trim().min(1).max(64),
});
export const draftIssueSchema = z.object({
  field: z.string().nullable(),
  code: z.string(),
  message: z.string(),
});
export const savedDraftSchema = z.object({
  context: resultPreviewContextSchema,
  id: z.uuid(),
  resultId: z.uuid(),
  version: z.number().int(),
  registrationId: z.uuid(),
  registrationNumber: z.string(),
  studentName: z.string(),
  examinationId: z.uuid(),
  examinationName: z.string(),
  programSubjectId: z.uuid(),
  subjectCode: z.string(),
  subjectName: z.string(),
  attemptNumber: z.number().int(),
  reExamApplicationId: z.uuid().nullable(),
  marks: draftMarksSchema,
  status: z.literal('DRAFT'),
  updatedAt: z.string(),
  issues: z.array(draftIssueSchema),
});
export const draftListSchema = z.object({ items: z.array(savedDraftSchema) });
export const draftLookupResponseSchema = z.object({
  registrationId: z.uuid(),
  registrationNumber: z.string(),
  studentName: z.string(),
  examinationKind: z.enum(['REGULAR', 'RE_EXAMINATION']),
  subjects: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      maxMarks: z.number().nullable(),
      components: z.array(
        z.object({
          field: z.enum(DRAFT_MARK_FIELDS),
          max: z.number().nullable(),
          required: z.boolean(),
        }),
      ),
      configurationIssue: z.string().nullable(),
      attemptNumber: z.number().int(),
      reExamApplicationId: z.uuid().nullable(),
      draft: savedDraftSchema.nullable(),
    }),
  ),
});
export const draftImportRowSchema = z.object({
  rowNumber: z.number().int(),
  action: z.enum(['CREATE', 'SKIP', 'REJECT']),
  message: z.string(),
  resultItemId: z.uuid().nullable(),
  issues: z.array(draftIssueSchema),
});
export const draftImportPlanSchema = z.object({
  digest: z.string().length(64),
  expiresAt: z.string(),
  counts: z.object({
    created: z.number().int(),
    updated: z.literal(0),
    skipped: z.number().int(),
    rejected: z.number().int(),
  }),
  rows: z.array(draftImportRowSchema),
});
export const commitDraftImportSchema = z
  .object({ batchId: z.uuid(), digest: z.string().length(64), confirmed: z.literal(true) })
  .strict();
export const draftImportOutcomeSchema = draftImportPlanSchema.extend({ batchId: z.uuid() });
export const draftAuditSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      actorUserId: z.uuid().nullable(),
      actorName: z.string().nullable(),
      action: z.string(),
      createdAt: z.string(),
      metadata: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});
export type SaveDraft = z.infer<typeof saveDraftSchema>;
export type DraftMarks = z.infer<typeof draftMarksSchema>;
export type SavedDraft = z.infer<typeof savedDraftSchema>;
export type DraftLookup = z.infer<typeof draftLookupSchema>;
export type DraftIssue = z.infer<typeof draftIssueSchema>;
export type DraftImportPlan = z.infer<typeof draftImportPlanSchema>;
export type CommitDraftImport = z.infer<typeof commitDraftImportSchema>;

export type DraftLookupResponse = z.infer<typeof draftLookupResponseSchema>;
