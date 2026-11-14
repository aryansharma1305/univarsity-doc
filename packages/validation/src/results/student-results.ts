import { z } from 'zod';
import { officialPublishedResultSchema } from '../public-verification/official.js';
import { syntheticPublishedResultSchema } from '../release-workflows.js';

export const studentResultsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

/** No marks contract is exposed until authoritative publication/release provenance exists. */
export const studentResultsPageSchema = z
  .object({
    publicationAvailable: z.boolean(),
    data: z
      .array(z.union([syntheticPublishedResultSchema, officialPublishedResultSchema]))
      .max(100),
    meta: z
      .object({
        page: z.number().int().min(1).max(100_000),
        pageSize: z.number().int().min(1).max(100),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type StudentResultsQuery = z.infer<typeof studentResultsQuerySchema>;
export type StudentResultsPage = z.infer<typeof studentResultsPageSchema>;
