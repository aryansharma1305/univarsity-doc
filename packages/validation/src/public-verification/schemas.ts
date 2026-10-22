import { z } from 'zod';

export const publicVerificationServices = [
  'result',
  'registration',
  'certificate',
  'admission-letter',
] as const;
export const publicVerificationServiceSchema = z.enum(publicVerificationServices);
export type PublicVerificationService = z.infer<typeof publicVerificationServiceSchema>;

/** No URL, student profile, password, academic context or client-asserted success is accepted. */
export const publicVerificationRequestSchema = z
  .object({
    contractVersion: z.literal(1),
    reference: z
      .string()
      .max(128)
      .transform((value) => value.normalize('NFKC').trim())
      .pipe(
        z
          .string()
          .min(3)
          .max(128)
          .regex(
            /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
            'Use a reference containing letters, numbers, dots, slashes or hyphens.',
          ),
      ),
  })
  .strict();
export type PublicVerificationRequest = z.infer<typeof publicVerificationRequestSchema>;

/** Case-sensitive opaque credentials must never be folded like registration numbers. */
export function normalizeVerificationReference(
  service: PublicVerificationService,
  reference: string,
): string {
  return service === 'result' || service === 'registration' ? reference.toUpperCase() : reference;
}

export const PUBLIC_VERIFICATION_UNAVAILABLE =
  'Public verification is unavailable. No record has been checked. This response does not indicate whether a record exists or is authentic.';
/** Reserved outcomes describe a service decision, never eligibility or academic achievement.
 * No disclosure fields are defined until university policy is approved. */
export const publicVerificationResponseSchema = z
  .object({
    contractVersion: z.literal(1),
    service: publicVerificationServiceSchema,
    status: z.enum(['VERIFIED', 'NOT_VERIFIED', 'UNAVAILABLE']),
    message: z.string().max(300),
  })
  .strict();
export const unavailableVerificationResponseSchema = publicVerificationResponseSchema.extend({
  status: z.literal('UNAVAILABLE'),
  message: z.literal(PUBLIC_VERIFICATION_UNAVAILABLE),
});
export type UnavailableVerificationResponse = z.infer<typeof unavailableVerificationResponseSchema>;
