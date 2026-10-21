import { z } from 'zod';

/**
 * Synthetic academic certificate previews (Phase 12C): Course Completion, Transcript, Provisional,
 * Character and Migration. Preview infrastructure only — inputs are fixed invented records, every
 * page is watermarked SAMPLE, signature lines are blank and there is no QR, token or verification
 * URL of any kind. These are NOT the Phase 12A TRAINING_CERTIFICATE (a separate training document).
 */
export const academicCertificateTypeSchema = z.enum([
  'COURSE_COMPLETION',
  'TRANSCRIPT',
  'PROVISIONAL',
  'CHARACTER',
  'MIGRATION',
]);
export type AcademicCertificateType = z.infer<typeof academicCertificateTypeSchema>;

export const ACADEMIC_TEMPLATE_IDS = {
  COURSE_COMPLETION: 'sample-course-completion',
  TRANSCRIPT: 'sample-transcript',
  PROVISIONAL: 'sample-provisional',
  CHARACTER: 'sample-character',
  MIGRATION: 'sample-migration',
} as const satisfies Record<AcademicCertificateType, string>;

export const academicFixtureSchema = z.enum([
  'standard',
  'long-text',
  'stress-semester',
  'stress-year',
]);
export type AcademicFixture = z.infer<typeof academicFixtureSchema>;
/** Multipage stress fixtures exist for transcripts only. */
export const TRANSCRIPT_ONLY_FIXTURES: readonly AcademicFixture[] = [
  'stress-semester',
  'stress-year',
];

/** Transcript structure; period labels must match it ("Semester n" / "Year n"). */
export const transcriptStructureSchema = z.enum(['SEMESTER_WISE', 'YEAR_WISE']);
export type TranscriptStructure = z.infer<typeof transcriptStructureSchema>;
/** Preview bounds: a transcript may span several A4 pages, never an unbounded document. */
export const TRANSCRIPT_LIMITS = {
  periods: 12,
  subjectsPerPeriod: 16,
  totalSubjects: 120,
} as const;

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}\p{Cf}<>]+$/u);
const sampleId = z.string().regex(/^SAMPLE-[A-Z0-9-]{1,48}$/);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);

const common = {
  kind: z.literal('SYNTHETIC_PREVIEW'),
  institutionName: z.literal('Example University of Learning'),
  studentName: text(100),
  guardianName: text(100),
  registrationNumber: sampleId,
  programName: text(160),
  issueDate: isoDate,
  certificateReference: sampleId,
};

const mark = z.string().regex(/^\d{1,3}$/);
export const transcriptSubjectSchema = z
  .object({ code: sampleId, name: text(160), maximum: mark, obtained: mark })
  .strict()
  .refine((s) => Number(s.obtained) <= Number(s.maximum), 'Obtained exceeds maximum');

export const academicCertificateInputSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('COURSE_COMPLETION'),
      ...common,
      courseName: text(160),
      durationText: text(40),
      periodText: text(100),
    })
    .strict(),
  z
    .object({
      type: z.literal('TRANSCRIPT'),
      ...common,
      sessionText: text(60),
      structure: transcriptStructureSchema,
      periods: z
        .array(
          z
            .object({
              label: text(60),
              subjects: z
                .array(transcriptSubjectSchema)
                .min(1)
                .max(TRANSCRIPT_LIMITS.subjectsPerPeriod),
            })
            .strict(),
        )
        .min(1)
        .max(TRANSCRIPT_LIMITS.periods),
    })
    .strict()
    .refine(
      (t) =>
        t.periods.every((p) =>
          p.label.startsWith(t.structure === 'SEMESTER_WISE' ? 'Semester ' : 'Year '),
        ),
      'Period labels must match the academic structure',
    )
    .refine(
      (t) =>
        t.periods.reduce((n, p) => n + p.subjects.length, 0) <= TRANSCRIPT_LIMITS.totalSubjects,
      'Too many subjects for a preview',
    ),
  z
    .object({
      type: z.literal('PROVISIONAL'),
      ...common,
      examinationText: text(120),
      resultText: text(60),
    })
    .strict(),
  z
    .object({
      type: z.literal('CHARACTER'),
      ...common,
      studyPeriodText: text(100),
    })
    .strict(),
  z
    .object({
      type: z.literal('MIGRATION'),
      ...common,
      studyPeriodText: text(100),
      lastExaminationText: text(120),
    })
    .strict(),
]);
export type AcademicCertificateInput = z.infer<typeof academicCertificateInputSchema>;

export const academicCertificateTemplateSchema = z
  .object({
    id: z.enum(Object.values(ACADEMIC_TEMPLATE_IDS) as [string, ...string[]]),
    version: z.literal(1),
    type: academicCertificateTypeSchema,
    status: z.literal('PREVIEW_ONLY'),
    name: text(80),
    title: text(60),
    description: text(240),
    signatoryTitles: z.array(text(60)).min(1).max(2),
  })
  .strict()
  .refine((t) => ACADEMIC_TEMPLATE_IDS[t.type] === t.id, 'Template id must match its type');
export type AcademicCertificateTemplate = z.infer<typeof academicCertificateTemplateSchema>;

export const academicCertificatePreviewQuerySchema = z
  .object({
    type: academicCertificateTypeSchema,
    version: z.coerce.number().pipe(z.literal(1)),
    fixture: academicFixtureSchema,
    disposition: z.enum(['inline', 'attachment']).default('inline'),
  })
  .strict()
  .refine((q) => q.type === 'TRANSCRIPT' || !TRANSCRIPT_ONLY_FIXTURES.includes(q.fixture), {
    message: 'This sample is available for transcripts only',
    path: ['fixture'],
  });
export type AcademicCertificatePreviewQuery = z.infer<typeof academicCertificatePreviewQuerySchema>;

export const academicCertificateTemplatesResponseSchema = z
  .object({
    templates: z.array(academicCertificateTemplateSchema).max(10),
    fixtures: z
      .array(
        z
          .object({
            id: academicFixtureSchema,
            label: text(80),
            certificateTypes: z.array(academicCertificateTypeSchema).min(1),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
