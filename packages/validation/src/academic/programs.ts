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

const durationSchema = z.preprocess(
  (value) =>
    value === '' || value === undefined ? undefined : value === null ? null : Number(value),
  z
    .number({ error: 'Enter a whole number of semesters.' })
    .int('Enter a whole number of semesters.')
    .min(1, 'Must be at least 1.')
    .max(40, 'Must be at most 40.')
    .nullable()
    .optional(),
);

export const programSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    level: z.string().nullable(),
    durationSemesters: z.number().int().nullable(),
    department: refSchema.nullable(),
    status: masterDataStatusSchema,
    registrationCount: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Program' });

export const programListSchema = paginatedSchema(programSchema).meta({ id: 'ProgramList' });

export const createProgramSchema = z
  .object({
    code: codeSchema,
    name: nameSchema,
    level: optionalText(64),
    durationSemesters: durationSchema,
    departmentId: optionalUuidSchema,
    status: masterDataStatusSchema.default('ACTIVE'),
  })
  .strict()
  .meta({ id: 'CreateProgram' });

export const updateProgramSchema = atLeastOneField(
  z
    .object({
      code: codeSchema.optional(),
      name: nameSchema.optional(),
      level: optionalText(64),
      durationSemesters: durationSchema,
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
