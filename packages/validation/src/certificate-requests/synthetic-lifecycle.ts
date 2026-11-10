import { z } from 'zod';

export const syntheticCertificatePolicySchema = z
  .object({
    contractVersion: z.literal(1),
    usage: z.literal('SYNTHETIC_ONLY'),
    registrationIds: z.array(z.uuid()).min(1).max(100),
    signing: z.literal('UNSIGNED_SAMPLE'),
  })
  .strict();
export const syntheticCertificateCommandSchema = z
  .object({
    requestId: z.uuid(),
    confirmed: z.literal(true),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .refine((value) =>
        Array.from(value).every(
          (char) => char.charCodeAt(0) >= 32 || [9, 10, 13].includes(char.charCodeAt(0)),
        ),
      )
      .optional(),
  })
  .strict();
export const prepareSyntheticCertificateSchema = syntheticCertificateCommandSchema.extend({
  registrationId: z.uuid(),
  replacesId: z.uuid().optional(),
});
export const syntheticCertificateReceiptSchema = z
  .object({
    contractVersion: z.literal(1),
    usage: z.literal('SYNTHETIC_ONLY'),
    certificateId: z.uuid(),
    status: z.enum(['PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'REVOKED', 'SUPERSEDED']),
    certificateNumber: z.string().startsWith('SAMPLE-NOT-VALID-').nullable(),
    unsigned: z.literal(true),
    officialIssuanceAllowed: z.literal(false),
  })
  .strict();
export type SyntheticCertificateCommand = z.infer<typeof syntheticCertificateCommandSchema>;
export type PrepareSyntheticCertificate = z.infer<typeof prepareSyntheticCertificateSchema>;
