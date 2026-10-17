import { z } from 'zod';

/** A fixed synthetic asset, never an issued certificate or a caller-selected template. */
export const studentCertificateSampleIdSchema = z.literal('sample-training-v1');
export const studentCertificateSampleQuerySchema = z
  .object({
    disposition: z.enum(['inline', 'attachment']).default('inline'),
  })
  .strict();
