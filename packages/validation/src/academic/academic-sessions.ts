import { z } from 'zod';
import {
  academicSessionStatusSchema,
  atLeastOneField,
  codeSchema,
  listQuerySchema,
  nameSchema,
  optionalDateSchema,
  optionalFilter,
  paginatedSchema,
} from './common.js';

export const academicSessionSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    name: z.string(),
    startsOn: z.iso.date().nullable(),
    endsOn: z.iso.date().nullable(),
    status: academicSessionStatusSchema,
    registrationCount: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'AcademicSession' });

export const academicSessionListSchema = paginatedSchema(academicSessionSchema).meta({
  id: 'AcademicSessionList',
});

/** Ends-on must not precede starts-on when both are given. */
export function datesInOrder(startsOn?: string | null, endsOn?: string | null): boolean {
  return !startsOn || !endsOn || endsOn >= startsOn;
}

const DATE_ORDER_MESSAGE = 'The end date must be on or after the start date.';

export const createAcademicSessionSchema = z
  .object({
    code: codeSchema,
    name: nameSchema,
    startsOn: optionalDateSchema,
    endsOn: optionalDateSchema,
    status: academicSessionStatusSchema.default('UPCOMING'),
  })
  .strict()
  .refine((value) => datesInOrder(value.startsOn, value.endsOn), {
    message: DATE_ORDER_MESSAGE,
    path: ['endsOn'],
  })
  .meta({ id: 'CreateAcademicSession' });

/** Partial update; the API re-checks date order against the stored values. */
export const updateAcademicSessionSchema = atLeastOneField(
  z
    .object({
      code: codeSchema.optional(),
      name: nameSchema.optional(),
      startsOn: optionalDateSchema,
      endsOn: optionalDateSchema,
      status: academicSessionStatusSchema.optional(),
    })
    .strict(),
)
  .refine((value) => datesInOrder(value.startsOn, value.endsOn), {
    message: DATE_ORDER_MESSAGE,
    path: ['endsOn'],
  })
  .meta({ id: 'UpdateAcademicSession' });

export const ACADEMIC_SESSION_SORT_FIELDS = [
  'code',
  'name',
  'startsOn',
  'status',
  'updatedAt',
] as const;
export const academicSessionQuerySchema = listQuerySchema(
  ACADEMIC_SESSION_SORT_FIELDS,
  'startsOn',
  {
    status: optionalFilter(academicSessionStatusSchema),
  },
);

export type AcademicSession = z.infer<typeof academicSessionSchema>;
export type AcademicSessionList = z.infer<typeof academicSessionListSchema>;
export type CreateAcademicSessionInput = z.input<typeof createAcademicSessionSchema>;
export type CreateAcademicSession = z.infer<typeof createAcademicSessionSchema>;
export type UpdateAcademicSession = z.infer<typeof updateAcademicSessionSchema>;
export type AcademicSessionQuery = z.infer<typeof academicSessionQuerySchema>;
export const ACADEMIC_SESSION_DATE_ORDER_MESSAGE = DATE_ORDER_MESSAGE;
