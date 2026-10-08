import { z } from 'zod';
import {
  atLeastOneField,
  blankToUndefined,
  codeSchema,
  listQuerySchema,
  masterDataStatusSchema,
  nameSchema,
  optionalDateSchema,
  optionalFilter,
  optionalText,
  paginatedSchema,
  refSchema,
  studentStatusSchema,
} from './common.js';

/**
 * Course & curriculum management (Phase 7B).
 *
 *   Program (course) → Curriculum version → Academic period (semester/year) → Subject assignment
 *
 * A Subject is a reusable catalogue entry; everything that may differ between courses (period,
 * credits, marks, classification, assessment components) lives on the assignment.
 */

export const ACADEMIC_STRUCTURES = ['SEMESTER_WISE', 'YEAR_WISE'] as const;
export const academicStructureSchema = z.enum(ACADEMIC_STRUCTURES);
export const DURATION_UNITS = ['MONTHS', 'YEARS'] as const;
export const durationUnitSchema = z.enum(DURATION_UNITS);
export const CURRICULUM_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export const curriculumStatusSchema = z.enum(CURRICULUM_STATUSES);
export const SUBJECT_CATEGORIES = ['THEORY', 'PRACTICAL', 'COMBINED'] as const;
export const subjectCategorySchema = z.enum(SUBJECT_CATEGORIES);

export const MAX_ACADEMIC_PERIODS = 40;

/** "Semester 2" / "Year 1". */
export function periodLabel(structure: AcademicStructure, period: number): string {
  return `${structure === 'YEAR_WISE' ? 'Year' : 'Semester'} ${String(period)}`;
}

/** Plural unit for counts: "2 semesters", "1 year". */
export function periodUnit(structure: AcademicStructure, count: number): string {
  const unit = structure === 'YEAR_WISE' ? 'year' : 'semester';
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
}

/** Number input that may arrive as a string from forms; '' → undefined, null stays null. */
function numberInput<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) =>
      value === '' || value === undefined ? undefined : value === null ? null : Number(value),
    schema,
  );
}

const hasAtMostTwoDecimals = (value: number) =>
  Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

/** Non-negative decimal with ≤ 2 decimals (NUMERIC(7,2) marks / NUMERIC(5,2) credits). */
function decimal(max: number, label: string) {
  return z
    .number({ error: `Enter a number for ${label}.` })
    .min(0, `${label[0]?.toUpperCase() ?? ''}${label.slice(1)} cannot be negative.`)
    .max(max, `Use at most ${String(max)}.`)
    .refine(hasAtMostTwoDecimals, 'Use at most two decimal places.');
}

export const periodCountSchema = z
  .number({ error: 'Enter the number of periods.' })
  .int('Enter a whole number.')
  .min(1, 'Must be at least 1.')
  .max(MAX_ACADEMIC_PERIODS, `Must be at most ${String(MAX_ACADEMIC_PERIODS)}.`);

// ------------------------------------------------------------------------------------------
// Subject catalogue
// ------------------------------------------------------------------------------------------

/** Subject codes are stored upper-case, so "ult-101" and "ULT-101" can never both exist. */
export const subjectCodeSchema = codeSchema.transform((value) => value.toUpperCase());

export const subjectSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    category: subjectCategorySchema.nullable(),
    defaultCredits: z.number().nullable(),
    status: masterDataStatusSchema,
    /** Number of curriculum assignments using this subject (any version, any program). */
    usageCount: z.number().int(),
    /** Catalogue identity is frozen when used in active/archived curricula or results. */
    historyLocked: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Subject' });

export const subjectListSchema = paginatedSchema(subjectSchema).meta({ id: 'SubjectList' });

const creditsInput = numberInput(decimal(99.99, 'credits').nullable().optional());

export const createSubjectSchema = z
  .object({
    code: subjectCodeSchema,
    name: nameSchema,
    description: optionalText(1000),
    category: subjectCategorySchema,
    defaultCredits: creditsInput,
    status: masterDataStatusSchema.default('ACTIVE'),
  })
  .strict()
  .meta({ id: 'CreateSubject' });

export const updateSubjectSchema = atLeastOneField(
  z
    .object({
      code: subjectCodeSchema.optional(),
      name: nameSchema.optional(),
      description: optionalText(1000),
      category: subjectCategorySchema.optional(),
      defaultCredits: creditsInput,
      status: masterDataStatusSchema.optional(),
    })
    .strict(),
).meta({ id: 'UpdateSubject' });

export const SUBJECT_SORT_FIELDS = ['code', 'name', 'updatedAt'] as const;
export const subjectQuerySchema = listQuerySchema(SUBJECT_SORT_FIELDS, 'code', {
  status: optionalFilter(masterDataStatusSchema),
  category: optionalFilter(subjectCategorySchema),
});

// ------------------------------------------------------------------------------------------
// Curriculum versions
// ------------------------------------------------------------------------------------------

const personRefSchema = z.object({ id: z.uuid(), displayName: z.string() }).nullable();

export const curriculumSummarySchema = z
  .object({
    id: z.uuid(),
    programId: z.uuid(),
    versionCode: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    structureType: academicStructureSchema,
    numberOfPeriods: z.number().int(),
    effectiveFrom: z.iso.date().nullable(),
    effectiveTo: z.iso.date().nullable(),
    status: curriculumStatusSchema,
    subjectCount: z.number().int(),
    registrationCount: z.number().int(),
    activatedAt: z.iso.datetime().nullable(),
    activatedBy: personRefSchema,
    archivedAt: z.iso.datetime().nullable(),
    archivedBy: personRefSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'CurriculumSummary' });

export const curriculumListSchema = z
  .object({ data: z.array(curriculumSummarySchema) })
  .meta({ id: 'CurriculumList' });

/**
 * Optional assessment components (e.g. Internal, External, Practical). Rule: when components are
 * configured AND the assignment has maximum marks, the components' maximum marks add up exactly to
 * the assignment's maximum marks. No grading formula is implied.
 */
export const assessmentComponentSchema = z.object({
  name: z.string().trim().min(1, 'Name the component.').max(64, 'Use at most 64 characters.'),
  maxMarks: numberInput(decimal(1000, 'maximum marks')),
  passMarks: numberInput(decimal(1000, 'passing marks').nullable().optional()),
});

const componentsSchema = z
  .array(
    assessmentComponentSchema.refine(
      (component) => component.passMarks == null || component.passMarks <= component.maxMarks,
      { message: 'Passing marks cannot exceed maximum marks.', path: ['passMarks'] },
    ),
  )
  .max(6, 'Use at most 6 components.')
  .refine(
    (components) =>
      new Set(components.map((component) => component.name.toLowerCase())).size ===
      components.length,
    'Component names must be unique.',
  );

export const curriculumSubjectSchema = z
  .object({
    id: z.uuid(),
    subject: z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      category: subjectCategorySchema.nullable(),
      status: masterDataStatusSchema,
    }),
    periodNumber: z.number().int(),
    displayOrder: z.number().int(),
    classification: subjectCategorySchema.nullable(),
    credits: z.number().nullable(),
    maxMarks: z.number().nullable(),
    passMarks: z.number().nullable(),
    components: z.array(
      z.object({ name: z.string(), maxMarks: z.number(), passMarks: z.number().nullable() }),
    ),
  })
  .meta({ id: 'CurriculumSubject' });

export const curriculumDetailSchema = curriculumSummarySchema
  .extend({
    program: z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      status: masterDataStatusSchema,
    }),
    periods: z.array(
      z.object({
        number: z.number().int(),
        label: z.string(),
        subjects: z.array(curriculumSubjectSchema),
      }),
    ),
  })
  .meta({ id: 'CurriculumDetail' });

const effectiveDatesInOrder = (value: {
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}) => !value.effectiveFrom || !value.effectiveTo || value.effectiveTo >= value.effectiveFrom;

const versionCodeSchema = z
  .string()
  .trim()
  .min(1, 'Enter a version code.')
  .max(32, 'Use at most 32 characters.')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Use letters, digits, ".", "_", "/" or "-" (no spaces).');

export const createCurriculumSchema = z
  .object({
    versionCode: versionCodeSchema,
    name: nameSchema,
    description: optionalText(1000),
    /** Default: the program's structure. */
    structureType: academicStructureSchema.optional(),
    numberOfPeriods: numberInput(periodCountSchema.optional()),
    effectiveFrom: optionalDateSchema,
    effectiveTo: optionalDateSchema,
    /** Copy every subject assignment from another version of the same program. */
    copyFromCurriculumId: z.preprocess(blankToUndefined, z.uuid().optional()),
  })
  .strict()
  .refine(effectiveDatesInOrder, {
    message: 'The end date must be on or after the start date.',
    path: ['effectiveTo'],
  })
  .meta({ id: 'CreateCurriculum' });

/** DRAFT: every field. ACTIVE: only `effectiveTo` (closing the version). ARCHIVED: nothing. */
export const updateCurriculumSchema = atLeastOneField(
  z
    .object({
      versionCode: versionCodeSchema.optional(),
      name: nameSchema.optional(),
      description: optionalText(1000),
      structureType: academicStructureSchema.optional(),
      numberOfPeriods: numberInput(periodCountSchema.optional()),
      effectiveFrom: optionalDateSchema,
      effectiveTo: optionalDateSchema,
    })
    .strict(),
)
  .refine(effectiveDatesInOrder, {
    message: 'The end date must be on or after the start date.',
    path: ['effectiveTo'],
  })
  .meta({ id: 'UpdateCurriculum' });

const marksInput = numberInput(decimal(1000, 'marks').nullable().optional());

const assignmentFields = {
  periodNumber: numberInput(
    z
      .number({ error: 'Choose the semester or year.' })
      .int()
      .min(1, 'Choose the semester or year.')
      .max(MAX_ACADEMIC_PERIODS),
  ),
  classification: subjectCategorySchema,
  credits: creditsInput,
  maxMarks: marksInput,
  passMarks: marksInput,
  components: componentsSchema.optional(),
};

/** Rules shared by add and update (applied to the merged values on update). */
export function assignmentRuleIssues(value: {
  maxMarks?: number | null;
  passMarks?: number | null;
  components?: { maxMarks: number }[] | undefined;
}): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (value.maxMarks != null && value.passMarks != null && value.passMarks > value.maxMarks) {
    issues.push({ path: 'passMarks', message: 'Passing marks cannot exceed maximum marks.' });
  }
  if (value.passMarks != null && value.maxMarks == null) {
    issues.push({ path: 'maxMarks', message: 'Enter maximum marks when passing marks are set.' });
  }
  const components = value.components ?? [];
  if (components.length > 0 && value.maxMarks != null) {
    const total = Math.round(components.reduce((sum, c) => sum + c.maxMarks, 0) * 100) / 100;
    if (total !== value.maxMarks) {
      issues.push({
        path: 'components',
        message: `The components add up to ${String(total)}, but maximum marks are ${String(value.maxMarks)}.`,
      });
    }
  }
  return issues;
}

export const addCurriculumSubjectSchema = z
  .object({ subjectId: z.uuid({ error: 'Choose a subject.' }), ...assignmentFields })
  .strict()
  .superRefine((value, context) => {
    for (const issue of assignmentRuleIssues(value)) {
      context.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
    }
  })
  .meta({ id: 'AddCurriculumSubject' });

export const updateCurriculumSubjectSchema = atLeastOneField(
  z
    .object({
      periodNumber: assignmentFields.periodNumber.optional(),
      classification: subjectCategorySchema.optional(),
      credits: creditsInput,
      maxMarks: marksInput,
      passMarks: marksInput,
      components: componentsSchema.optional(),
    })
    .strict(),
).meta({ id: 'UpdateCurriculumSubject' });

export const reorderCurriculumSubjectsSchema = z
  .object({
    periodNumber: z.number().int().min(1).max(MAX_ACADEMIC_PERIODS),
    /** Every assignment of the period, in the new order. */
    assignmentIds: z.array(z.uuid()).min(1).max(200),
  })
  .strict()
  .refine((value) => new Set(value.assignmentIds).size === value.assignmentIds.length, {
    message: 'Each subject may appear once.',
    path: ['assignmentIds'],
  })
  .meta({ id: 'ReorderCurriculumSubjects' });

// ------------------------------------------------------------------------------------------
// Registrations ↔ curriculum
// ------------------------------------------------------------------------------------------

export const curriculumRefSchema = z
  .object({
    id: z.uuid(),
    versionCode: z.string(),
    name: z.string(),
    status: curriculumStatusSchema,
  })
  .meta({ id: 'CurriculumRef' });

export const curriculumRegistrationSchema = z
  .object({
    registrationId: z.uuid(),
    registrationNumber: z.string(),
    studentId: z.uuid(),
    studentName: z.string(),
    academicSession: refSchema,
    status: studentStatusSchema,
    curriculum: curriculumRefSchema.nullable(),
  })
  .meta({ id: 'CurriculumRegistration' });

export const curriculumRegistrationListSchema = paginatedSchema(curriculumRegistrationSchema).meta({
  id: 'CurriculumRegistrationList',
});

export const CURRICULUM_REGISTRATION_SORT_FIELDS = ['registrationNumber', 'studentName'] as const;
export const curriculumRegistrationQuerySchema = listQuerySchema(
  CURRICULUM_REGISTRATION_SORT_FIELDS,
  'registrationNumber',
  {
    academicSessionId: optionalFilter(z.uuid()),
    /** unassigned: no curriculum · this: this version · other: another version of the program. */
    assignment: optionalFilter(z.enum(['unassigned', 'this', 'other'])),
  },
);

export const assignCurriculumSchema = z
  .object({
    registrationIds: z
      .array(z.uuid())
      .min(1, 'Choose at least one registration.')
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, 'Choose each registration once.'),
    /** Required to move registrations that already follow another version. */
    replaceExisting: z.boolean().default(false),
  })
  .strict()
  .meta({ id: 'AssignCurriculum' });

export const assignCurriculumResultSchema = z
  .object({
    assigned: z.number().int(),
    skipped: z.array(
      z.object({
        registrationId: z.uuid(),
        registrationNumber: z.string().nullable(),
        reason: z.string(),
      }),
    ),
  })
  .meta({ id: 'AssignCurriculumResult' });

/** What a signed-in student sees: the curriculum of each of their registrations. */
export const studentCurriculumSchema = z
  .object({
    registrations: z.array(
      z.object({
        registrationId: z.uuid(),
        registrationNumber: z.string(),
        program: refSchema,
        curriculum: z
          .object({
            versionCode: z.string(),
            name: z.string(),
            structureType: academicStructureSchema,
            numberOfPeriods: z.number().int(),
            status: curriculumStatusSchema,
            periods: z.array(
              z.object({
                number: z.number().int(),
                label: z.string(),
                subjects: z.array(
                  z.object({
                    code: z.string(),
                    name: z.string(),
                    classification: subjectCategorySchema.nullable(),
                    credits: z.number().nullable(),
                  }),
                ),
              }),
            ),
          })
          .nullable(),
      }),
    ),
  })
  .meta({ id: 'StudentCurriculum' });

export type AcademicStructure = z.infer<typeof academicStructureSchema>;
export type DurationUnit = z.infer<typeof durationUnitSchema>;
export type CurriculumStatus = z.infer<typeof curriculumStatusSchema>;
export type SubjectCategory = z.infer<typeof subjectCategorySchema>;
export type Subject = z.infer<typeof subjectSchema>;
export type SubjectList = z.infer<typeof subjectListSchema>;
export type CreateSubject = z.infer<typeof createSubjectSchema>;
export type CreateSubjectInput = z.input<typeof createSubjectSchema>;
export type UpdateSubject = z.infer<typeof updateSubjectSchema>;
export type SubjectQuery = z.infer<typeof subjectQuerySchema>;
export type CurriculumSummary = z.infer<typeof curriculumSummarySchema>;
export type CurriculumList = z.infer<typeof curriculumListSchema>;
export type CurriculumDetail = z.infer<typeof curriculumDetailSchema>;
export type CurriculumSubject = z.infer<typeof curriculumSubjectSchema>;
export type CreateCurriculum = z.infer<typeof createCurriculumSchema>;
export type CreateCurriculumInput = z.input<typeof createCurriculumSchema>;
export type UpdateCurriculum = z.infer<typeof updateCurriculumSchema>;
export type AddCurriculumSubject = z.infer<typeof addCurriculumSubjectSchema>;
export type AddCurriculumSubjectInput = z.input<typeof addCurriculumSubjectSchema>;
export type UpdateCurriculumSubject = z.infer<typeof updateCurriculumSubjectSchema>;
export type ReorderCurriculumSubjects = z.infer<typeof reorderCurriculumSubjectsSchema>;
export type AssessmentComponent = z.infer<typeof assessmentComponentSchema>;
export type CurriculumRef = z.infer<typeof curriculumRefSchema>;
export type CurriculumRegistration = z.infer<typeof curriculumRegistrationSchema>;
export type CurriculumRegistrationList = z.infer<typeof curriculumRegistrationListSchema>;
export type CurriculumRegistrationQuery = z.infer<typeof curriculumRegistrationQuerySchema>;
export type AssignCurriculum = z.infer<typeof assignCurriculumSchema>;
export type AssignCurriculumResult = z.infer<typeof assignCurriculumResultSchema>;
export type StudentCurriculum = z.infer<typeof studentCurriculumSchema>;
