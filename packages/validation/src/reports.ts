import { z } from 'zod';
import { dateOnlySchema, optionalFilter, studentStatusSchema } from './academic/common.js';

/**
 * Operational reports: aggregate counts only, never personal data. Each report accepts only the
 * filters that apply to it (strict), and the CSV export uses the same query and permission.
 */
export const REPORT_NAMES = [
  'enrolment',
  'certificate-requests',
  'issued-documents',
  'results',
  're-exam-applications',
  'verification-activity',
  'student-messages',
  'verification-queries',
] as const;
export const reportNameSchema = z.enum(REPORT_NAMES);
export type ReportName = z.infer<typeof reportNameSchema>;

const uuidFilter = optionalFilter(z.uuid());
/** `csv` downloads the same rows as a CSV file. */
const format = { format: optionalFilter(z.enum(['json', 'csv'])) };
const dateRange = {
  from: optionalFilter(dateOnlySchema),
  to: optionalFilter(dateOnlySchema),
  ...format,
};
const ordered = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object(shape)
    .strict()
    .refine(
      (value: { from?: string; to?: string }) => !value.from || !value.to || value.from <= value.to,
      { message: 'The start date must not be after the end date.', path: ['to'] },
    );

export const REPORT_QUERY_SCHEMAS = {
  enrolment: z
    .object({
      academicSessionId: uuidFilter,
      programId: uuidFilter,
      status: optionalFilter(studentStatusSchema),
      ...format,
    })
    .strict(),
  'certificate-requests': ordered(dateRange),
  'issued-documents': ordered({ ...dateRange, programId: uuidFilter }),
  results: z.object({ academicSessionId: uuidFilter, programId: uuidFilter, ...format }).strict(),
  're-exam-applications': z
    .object({ academicSessionId: uuidFilter, programId: uuidFilter, ...format })
    .strict(),
  'verification-activity': ordered(dateRange),
  'student-messages': ordered(dateRange),
  'verification-queries': ordered(dateRange),
} as const satisfies Record<ReportName, z.ZodType>;

export interface ReportQuery {
  academicSessionId?: string;
  programId?: string;
  status?: z.infer<typeof studentStatusSchema>;
  from?: string;
  to?: string;
  format?: 'json' | 'csv';
}

export const reportSchema = z
  .object({
    report: reportNameSchema,
    columns: z.array(z.object({ key: z.string(), label: z.string() })),
    rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
    /** Sum of the count column across all rows. */
    total: z.number().int().nonnegative(),
    generatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Report' });
export type Report = z.infer<typeof reportSchema>;
