import { z } from 'zod';

/**
 * Pagination contract shared by every list endpoint:
 *   request:  ?page=1&pageSize=25&search=…&status=…&sortBy=<allow-listed>&sortOrder=asc|desc
 *   response: { data: [...], meta: { page, pageSize, total, totalPages } }
 */
export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 100;

/** Treats '' (empty form/query values) as "not provided". */
export function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export function paginatedSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({ data: z.array(item), meta: paginationMetaSchema });
}

/** Builds a strict list-query schema with an allow-listed `sortBy`. Unknown parameters are rejected. */
export function listQuerySchema<
  const TSort extends readonly [string, ...string[]],
  TExtra extends z.ZodRawShape,
>(sortFields: TSort, defaultSort: TSort[number], extra: TExtra) {
  return z
    .object({
      page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(100_000).default(1)),
      pageSize: z.preprocess(
        blankToUndefined,
        z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
      ),
      search: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
      sortBy: z.preprocess(blankToUndefined, z.enum(sortFields).default(defaultSort as never)),
      sortOrder: z.preprocess(blankToUndefined, z.enum(['asc', 'desc']).default('asc')),
      ...extra,
    })
    .strict();
}

/** Optional filter value (empty string = no filter). */
export function optionalFilter<T extends z.ZodType>(schema: T) {
  return z.preprocess(blankToUndefined, schema.optional());
}

/** Human code (department/program/session): trimmed, no spaces, 1–32 characters. */
export const codeSchema = z
  .string()
  .trim()
  .min(1, 'Enter a code.')
  .max(32, 'Use at most 32 characters.')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Use letters, digits, ".", "_", "/" or "-" (no spaces).');

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name.')
  .max(200, 'Use at most 200 characters.');

/** Calendar date as YYYY-MM-DD. */
export const dateOnlySchema = z.iso.date({ error: 'Enter a valid date (YYYY-MM-DD).' });

/** Optional, clearable text: '' / null → null. */
export function optionalText(max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max, `Use at most ${max} characters.`).nullable().optional(),
  );
}

/** Optional, clearable date: '' / null → null. */
export const optionalDateSchema = z.preprocess(
  (value) => (value === '' ? null : value),
  dateOnlySchema.nullable().optional(),
);

export const optionalUuidSchema = z.preprocess(
  (value) => (value === '' ? null : value),
  z.uuid().nullable().optional(),
);

export const masterDataStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const academicSessionStatusSchema = z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']);
export const studentStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'SUSPENDED', 'REVOKED']);

export type MasterDataStatus = z.infer<typeof masterDataStatusSchema>;
export type AcademicSessionStatus = z.infer<typeof academicSessionStatusSchema>;
export type StudentStatus = z.infer<typeof studentStatusSchema>;

/** A reference to a related record as returned by the API. */
export const refSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

/** Requires at least one field in a PATCH body. */
export function atLeastOneField<T extends z.ZodObject>(schema: T) {
  return schema.refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update.',
  });
}

/** Activity (audit) entry as shown to staff: a safe summary, never raw metadata. */
export const activityItemSchema = z
  .object({
    id: z.uuid(),
    action: z.string(),
    summary: z.string(),
    actor: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'ActivityItem' });

export type ActivityItem = z.infer<typeof activityItemSchema>;
