import { z } from 'zod';
import {
  atLeastOneField,
  codeSchema,
  listQuerySchema,
  masterDataStatusSchema,
  nameSchema,
  optionalFilter,
  optionalText,
  optionalUuidSchema,
  paginatedSchema,
  refSchema,
} from './common.js';
import { academicStructureSchema, durationUnitSchema, MAX_ACADEMIC_PERIODS } from './curricula.js';

/** Course types offered as suggestions; `level` stays free text (existing values are preserved). */
export const PROGRAM_LEVEL_SUGGESTIONS = [
  'CERTIFICATE',
  'DIPLOMA',
  'UG',
  'PG',
  'DOCTORAL',
] as const;

function wholeNumber(message: string, max: number) {
  return z.preprocess(
    (value) =>
      value === '' || value === undefined ? undefined : value === null ? null : Number(value),
    z
      .number({ error: message })
      .int(message)
      .min(1, 'Must be at least 1.')
      .max(max, `Must be at most ${String(max)}.`)
      .nullable()
      .optional(),
  );
}

const durationValueSchema = wholeNumber('Enter a whole number.', 240);
const periodCountInput = wholeNumber(
  'Enter a whole number of semesters or years.',
  MAX_ACADEMIC_PERIODS,
);

export const programSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    /** Course type / level (free text, e.g. CERTIFICATE, DIPLOMA, UG, PG). */
    level: z.string().nullable(),
    description: z.string().nullable(),
    durationValue: z.number().int().nullable(),
    durationUnit: durationUnitSchema.nullable(),
    academicStructure: academicStructureSchema.nullable(),
    periodCount: z.number().int().nullable(),
    /** Legacy: the period count of SEMESTER_WISE programs, otherwise null. Derived by the API. */
    durationSemesters: z.number().int().nullable(),
    department: refSchema.nullable(),
    status: masterDataStatusSchema,
    registrationCount: z.number().int(),
    curriculumCount: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Program' });

export const programListSchema = paginatedSchema(programSchema).meta({ id: 'ProgramList' });

/** Cross-field rules, also applied by the API to the merged values of an update. */
export function programStructureIssues(value: {
  durationSemesters?: number | null;
  durationValue?: number | null;
  durationUnit?: string | null;
  academicStructure?: string | null;
  periodCount?: number | null;
}): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (
    value.durationSemesters !== undefined &&
    (value.academicStructure !== undefined || value.periodCount !== undefined)
  ) {
    issues.push({
      path: 'durationSemesters',
      message: 'Use academicStructure and periodCount instead of durationSemesters.',
    });
    return issues;
  }
  if ((value.durationValue == null) !== (value.durationUnit == null)) {
    issues.push(
      value.durationValue == null
        ? { path: 'durationValue', message: 'Enter the duration.' }
        : { path: 'durationUnit', message: 'Choose months or years.' },
    );
  }
  if (value.durationUnit === 'YEARS' && value.durationValue != null && value.durationValue > 20) {
    issues.push({ path: 'durationValue', message: 'Must be at most 20 years.' });
  }
  if ((value.academicStructure == null) !== (value.periodCount == null)) {
    issues.push(
      value.academicStructure == null
        ? { path: 'academicStructure', message: 'Choose semester-wise or year-wise.' }
        : { path: 'periodCount', message: 'Enter the number of semesters or years.' },
    );
  }
  return issues;
}

const structureFields = {
  description: optionalText(1000),
  /**
   * Deprecated input (Phase 4 contract), still accepted: N semesters ⇒ SEMESTER_WISE with N
   * periods. Cannot be combined with academicStructure/periodCount.
   */
  durationSemesters: periodCountInput,
  durationValue: durationValueSchema,
  durationUnit: z.preprocess(blankToNull, durationUnitSchema.nullable().optional()),
  academicStructure: z.preprocess(blankToNull, academicStructureSchema.nullable().optional()),
  periodCount: periodCountInput,
};

function blankToNull(value: unknown): unknown {
  return value === '' ? null : value;
}

export const createProgramSchema = z
  .object({
    code: codeSchema,
    name: nameSchema,
    level: optionalText(64),
    ...structureFields,
    departmentId: optionalUuidSchema,
    status: masterDataStatusSchema.default('ACTIVE'),
  })
  .strict()
  .superRefine((value, context) => {
    for (const issue of programStructureIssues(value)) {
      context.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
    }
  })
  .meta({ id: 'CreateProgram' });

export const updateProgramSchema = atLeastOneField(
  z
    .object({
      code: codeSchema.optional(),
      name: nameSchema.optional(),
      level: optionalText(64),
      ...structureFields,
      departmentId: optionalUuidSchema,
      status: masterDataStatusSchema.optional(),
    })
    .strict(),
).meta({ id: 'UpdateProgram' });

export const PROGRAM_SORT_FIELDS = ['code', 'name', 'level', 'status', 'updatedAt'] as const;
export const programQuerySchema = listQuerySchema(PROGRAM_SORT_FIELDS, 'code', {
  status: optionalFilter(masterDataStatusSchema),
  departmentId: optionalFilter(z.uuid()),
});

export type Program = z.infer<typeof programSchema>;
export type ProgramList = z.infer<typeof programListSchema>;
export type CreateProgramInput = z.input<typeof createProgramSchema>;
export type CreateProgram = z.infer<typeof createProgramSchema>;
export type UpdateProgram = z.infer<typeof updateProgramSchema>;
export type ProgramQuery = z.infer<typeof programQuerySchema>;
