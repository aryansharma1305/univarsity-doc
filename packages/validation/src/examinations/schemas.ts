import { z } from 'zod';
import {
  activityItemSchema,
  atLeastOneField,
  codeSchema,
  listQuerySchema,
  nameSchema,
  optionalFilter,
  paginatedSchema,
  refSchema,
} from '../academic/common.js';
import { academicStructureSchema } from '../academic/curricula.js';

/**
 * Examinations (Phase 9A).
 *
 * The university conducts examinations in its own, separate mobile application. Docversity does NOT
 * run examinations: it links to that application, keeps examination RECORDS (which curriculum,
 * period and session an examination belongs to) and, from Phase 9B, takes re-exam applications.
 * Nothing here schedules examinations or decides eligibility.
 */

// ----------------------------------------------------------------------------------------------
// External examination application
// ----------------------------------------------------------------------------------------------

/**
 * An https URL as the university provides it: https only (no http, javascript:, data:, …), a
 * hostname, no embedded user name/password and no whitespace. Nothing is fetched or rewritten.
 */
export function isSafeHttpsUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname.length > 0 &&
    url.username === '' &&
    url.password === '' &&
    /^https:\/\/[^/?#@\s]+([/?#]\S*)?$/.test(value)
  );
}

const HTTPS_MESSAGE = 'Enter the full https:// address provided by the university.';

const httpsUrlSchema = z
  .string()
  .trim()
  .min(1, HTTPS_MESSAGE)
  .max(512, 'Use at most 512 characters.')
  .refine(isSafeHttpsUrl, HTTPS_MESSAGE);

const optionalHttpsUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  httpsUrlSchema.nullable().optional(),
);

const instructionsSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().max(4000, 'Use at most 4000 characters.').nullable().optional(),
);

const examAppFields = {
  name: z.string().trim().min(1, 'Enter the application name.').max(120),
  websiteUrl: httpsUrlSchema,
  androidUrl: optionalHttpsUrlSchema,
  iosUrl: optionalHttpsUrlSchema,
  instructions: instructionsSchema,
  isActive: z.boolean(),
};

export const createExternalExamAppSchema = z
  .object({ ...examAppFields, isActive: examAppFields.isActive.default(false) })
  .strict()
  .meta({ id: 'CreateExternalExamApp' });

export const updateExternalExamAppSchema = atLeastOneField(
  z.object(examAppFields).partial().strict(),
).meta({ id: 'UpdateExternalExamApp' });

export const externalExamAppSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    websiteUrl: z.string(),
    androidUrl: z.string().nullable(),
    iosUrl: z.string().nullable(),
    instructions: z.string().nullable(),
    isActive: z.boolean(),
    updatedAt: z.iso.datetime(),
    updatedBy: z.object({ id: z.uuid(), displayName: z.string() }),
  })
  .meta({ id: 'ExternalExamApp' });

export const externalExamAppListSchema = z
  .object({ data: z.array(externalExamAppSchema) })
  .meta({ id: 'ExternalExamAppList' });

// ----------------------------------------------------------------------------------------------
// Examination records
// ----------------------------------------------------------------------------------------------

export const EXAMINATION_KINDS = ['REGULAR', 'RE_EXAMINATION'] as const;
export const examinationKindSchema = z.enum(EXAMINATION_KINDS);
export const EXAMINATION_KIND_LABELS: Record<ExaminationKind, string> = {
  REGULAR: 'Regular examination',
  RE_EXAMINATION: 'Re-examination',
};

/** Statuses used by Phase 9 records (UNDER_REVIEW / PUBLISHED belong to results, Phase 10). */
export const examinationStatusSchema = z.enum([
  'DRAFT',
  'OPEN',
  'UNDER_REVIEW',
  'PUBLISHED',
  'ARCHIVED',
]);

const labelSchema = (max: number, message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .max(max, `Use at most ${String(max)} characters.`);

const optionalLabel = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .trim()
      .max(max, `Use at most ${String(max)} characters.`)
      .nullable()
      .optional(),
  );

export const createExaminationSchema = z
  .object({
    code: codeSchema.max(64),
    name: nameSchema,
    /** The program is taken from the curriculum version. */
    curriculumId: z.uuid({ error: 'Choose the curriculum version.' }),
    academicSessionId: z.uuid({ error: 'Choose the academic session.' }),
    /** Semester or year number of that curriculum. */
    periodNumber: z.coerce.number().int().min(1, 'Choose the semester or year.').max(20),
    kind: examinationKindSchema,
    /** When the examination is held, as the university labels it (e.g. "May–June 2026"). */
    examSession: labelSchema(64, 'Enter the examination session (e.g. "May–June 2026").'),
    /** Optional free-text label (e.g. "SUPPLEMENTARY"). */
    examType: optionalLabel(32),
  })
  .strict()
  .meta({ id: 'CreateExamination' });

/** DRAFT only. The curriculum (and so the program) and kind are fixed once created. */
export const updateExaminationSchema = atLeastOneField(
  z
    .object({
      name: nameSchema,
      academicSessionId: z.uuid(),
      periodNumber: z.coerce.number().int().min(1).max(20),
      examSession: labelSchema(64, 'Enter the examination session.'),
      examType: optionalLabel(32),
    })
    .partial()
    .strict(),
).meta({ id: 'UpdateExamination' });

export const setReExamApplicationsSchema = z
  .object({ open: z.boolean() })
  .strict()
  .meta({ id: 'SetReExamApplications' });

const periodSchema = z.object({ number: z.number().int(), label: z.string() });

export const examinationRowSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    kind: examinationKindSchema,
    examType: z.string().nullable(),
    examSession: z.string(),
    status: examinationStatusSchema,
    program: refSchema,
    curriculum: z
      .object({
        id: z.uuid(),
        versionCode: z.string(),
        name: z.string(),
        structureType: academicStructureSchema,
        numberOfPeriods: z.number().int(),
      })
      .nullable(),
    academicSession: refSchema,
    period: periodSchema,
    reExamApplicationsOpen: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'ExaminationRow' });

export const examinationDetailSchema = examinationRowSchema
  .extend({ history: z.array(activityItemSchema) })
  .meta({ id: 'ExaminationDetail' });

export const examinationListSchema = paginatedSchema(examinationRowSchema).meta({
  id: 'ExaminationList',
});

export const EXAMINATION_SORT_FIELDS = ['createdAt', 'code'] as const;
export const examinationQuerySchema = listQuerySchema(EXAMINATION_SORT_FIELDS, 'createdAt', {
  programId: optionalFilter(z.uuid()),
  curriculumId: optionalFilter(z.uuid()),
  academicSessionId: optionalFilter(z.uuid()),
  kind: optionalFilter(examinationKindSchema),
  status: optionalFilter(examinationStatusSchema),
});

// ----------------------------------------------------------------------------------------------
// Student view
// ----------------------------------------------------------------------------------------------

/**
 * The signed-in student's examination page: the university's examination application (active
 * links only) and, per own registration, the periods of the assigned curriculum and the OPEN
 * examination records of that curriculum. No schedules or eligibility are implied.
 */
export const studentExaminationsSchema = z
  .object({
    applications: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        websiteUrl: z.string(),
        androidUrl: z.string().nullable(),
        iosUrl: z.string().nullable(),
        instructions: z.string().nullable(),
      }),
    ),
    registrations: z.array(
      z.object({
        registrationId: z.uuid(),
        registrationNumber: z.string(),
        program: refSchema,
        academicSession: refSchema,
        curriculum: z
          .object({
            versionCode: z.string(),
            name: z.string(),
            structureType: academicStructureSchema,
            periods: z.array(periodSchema),
          })
          .nullable(),
        examinations: z.array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            kind: examinationKindSchema,
            examSession: z.string(),
            examType: z.string().nullable(),
            period: periodSchema,
            reExamApplicationsOpen: z.boolean(),
          }),
        ),
      }),
    ),
  })
  .meta({ id: 'StudentExaminations' });

export type ExaminationKind = z.infer<typeof examinationKindSchema>;
export type ExaminationStatus = z.infer<typeof examinationStatusSchema>;
export type CreateExternalExamApp = z.infer<typeof createExternalExamAppSchema>;
export type CreateExternalExamAppInput = z.input<typeof createExternalExamAppSchema>;
export type UpdateExternalExamApp = z.infer<typeof updateExternalExamAppSchema>;
export type ExternalExamApp = z.infer<typeof externalExamAppSchema>;
export type ExternalExamAppList = z.infer<typeof externalExamAppListSchema>;
export type CreateExamination = z.infer<typeof createExaminationSchema>;
export type CreateExaminationInput = z.input<typeof createExaminationSchema>;
export type UpdateExamination = z.infer<typeof updateExaminationSchema>;
export type SetReExamApplications = z.infer<typeof setReExamApplicationsSchema>;
export type ExaminationRow = z.infer<typeof examinationRowSchema>;
export type ExaminationDetail = z.infer<typeof examinationDetailSchema>;
export type ExaminationList = z.infer<typeof examinationListSchema>;
export type ExaminationQuery = z.infer<typeof examinationQuerySchema>;
export type StudentExaminations = z.infer<typeof studentExaminationsSchema>;
