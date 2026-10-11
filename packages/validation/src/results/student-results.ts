import { z } from 'zod';

export const studentResultsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

/** No marks contract is exposed until authoritative publication/release provenance exists. */
export const studentResultsPageSchema = z
  .object({
    publicationAvailable: z.literal(false),
    data: z.tuple([]),
    meta: z
      .object({
        page: z.number().int().min(1).max(100_000),
        pageSize: z.number().int().min(1).max(100),
        total: z.literal(0),
        totalPages: z.literal(0),
      })
      .strict(),
  })
  .strict();

export type StudentResultsQuery = z.infer<typeof studentResultsQuerySchema>;
export type StudentResultsPage = z.infer<typeof studentResultsPageSchema>;
