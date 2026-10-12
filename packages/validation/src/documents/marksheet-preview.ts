import { z } from 'zod';

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}\p{Cf}<>]+$/u);
const numeric = z.string().regex(/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/);
const points = z.string().regex(/^(?:0|[1-9]\d{0,3})(?:\.\d{1,3})?$/);
export const previewMarkSchema = z
  .object({
    maximum: numeric,
    obtained: numeric.nullable(),
    state: z.enum(['RECORDED', 'UNAVAILABLE', 'WITHHELD', 'ABSENT']),
  })
  .strict()
  .superRefine((m, ctx) => {
    if ((m.state === 'RECORDED') !== (m.obtained !== null))
      ctx.addIssue({
        code: 'custom',
        path: ['obtained'],
        message: 'Only recorded marks may have a numeric value.',
      });
    if (m.obtained !== null && Number(m.obtained) > Number(m.maximum))
      ctx.addIssue({
        code: 'custom',
        path: ['obtained'],
        message: 'Marks exceed the supplied maximum.',
      });
  });
const subject = z
  .object({
    code: text(24),
    name: text(180),
    internal: previewMarkSchema.optional(),
    external: previewMarkSchema.optional(),
    practical: previewMarkSchema.optional(),
    other: previewMarkSchema.optional(),
    total: previewMarkSchema.optional(),
    grade: text(12).nullable().optional(),
    gradePoint: points.nullable().optional(),
    officialStatus: text(40).nullable().optional(),
  })
  .strict();
export const marksheetPreviewInputSchema = z
  .object({
    kind: z.literal('SYNTHETIC_PREVIEW'),
    institution: z
      .object({
        name: text(100),
        address: text(160).optional(),
        identifier: text(60).optional(),
        officeTitle: text(80),
        logoAsset: z.literal('NONE').default('NONE'),
      })
      .strict(),
    student: z
      .object({
        fullName: text(100),
        registrationNumber: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[A-Z0-9][A-Z0-9/-]*$/),
        programName: text(140),
        courseName: text(140).optional(),
        academicSession: text(60),
        academicLevel: text(60).optional(),
      })
      .strict(),
    examination: z.object({ session: text(80), attemptLabel: text(40).optional() }).strict(),
    period: z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('SEMESTER_WISE'),
          label: text(80),
          number: z.number().int().min(1).max(30),
        })
        .strict(),
      z
        .object({
          type: z.literal('YEAR_WISE'),
          label: text(80),
          number: z.number().int().min(1).max(15),
        })
        .strict(),
    ]),
    subjects: z.array(subject).min(1).max(80),
    summary: z
      .object({
        overallMarks: previewMarkSchema.optional(),
        gpa: points.nullable().optional(),
        percentage: numeric.nullable().optional(),
        officialStatus: text(60).nullable().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (new Set(input.subjects.map((s) => s.code)).size !== input.subjects.length)
      ctx.addIssue({
        code: 'custom',
        path: ['subjects'],
        message: 'Subject codes must be unique.',
      });
    if (input.summary.percentage != null && Number(input.summary.percentage) > 100)
      ctx.addIssue({
        code: 'custom',
        path: ['summary', 'percentage'],
        message: 'Percentage exceeds 100.',
      });
  });

export const marksheetTemplateSchema = z
  .object({
    id: z.literal('sample-academic'),
    version: z.literal(1),
    status: z.literal('PREVIEW_ONLY'),
    name: text(80),
    supportedPeriods: z
      .array(z.enum(['SEMESTER_WISE', 'YEAR_WISE']))
      .min(1)
      .max(2),
    settings: z
      .object({
        pageSize: z.literal('A4'),
        margin: z.number().min(36).max(54),
        bodySize: z.number().min(8).max(10),
        rowPadding: z.number().min(6).max(10),
        font: z.literal('NOTO_SANS'),
        headerColor: z.enum(['NAVY', 'BLACK']),
      })
      .strict(),
  })
  .strict();
export const marksheetTemplatesResponseSchema = z
  .object({
    templates: z.array(marksheetTemplateSchema).max(10),
    fixtures: z
      .array(
        z
          .object({
            id: z.enum(['semester', 'year', 'stress']),
            label: text(80),
            periodType: z.enum(['SEMESTER_WISE', 'YEAR_WISE']),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();
export const marksheetPreviewQuerySchema = z
  .object({
    templateId: z.literal('sample-academic'),
    version: z.coerce.number().pipe(z.literal(1)),
    fixture: z.enum(['semester', 'year', 'stress']),
    disposition: z.enum(['inline', 'attachment']).default('inline'),
  })
  .strict();
export type MarksheetPreviewInput = z.infer<typeof marksheetPreviewInputSchema>;
export type MarksheetTemplate = z.infer<typeof marksheetTemplateSchema>;
export type MarksheetPreviewQuery = z.infer<typeof marksheetPreviewQuerySchema>;
