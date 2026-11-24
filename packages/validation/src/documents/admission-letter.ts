import { z } from 'zod';

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}]*$/u, 'Control characters are not allowed.');

/**
 * Everything printed on a generated admission letter. The API fills it only from authoritative
 * records (registration, student, course, department, session, approved policy and template) plus
 * the staff-entered letter number, issue date and authority reference — never free-typed names.
 */
export const admissionLetterInputSchema = z
  .object({
    institutionName: line(200),
    letterNumber: line(64),
    issueDate: z.iso.date(),
    authorityReference: line(200),
    studentName: line(200),
    nationality: line(80),
    registrationNumber: line(64),
    courseName: line(200),
    courseLevel: line(80).nullable(),
    courseDuration: line(80).nullable(),
    school: line(200).nullable(),
    academicSession: line(120),
    admissionDate: z.iso.date().nullable(),
    templateName: line(120),
    templateVersion: z.number().int().positive(),
    /** Public verification page (production domain), printed so readers can check the number. */
    verifyUrl: z.url({ protocol: /^https?$/ }),
  })
  .strict();
export type AdmissionLetterInput = z.infer<typeof admissionLetterInputSchema>;

/** Staff request to preview a generated letter for one registration (nothing is stored). */
export const admissionLetterPreviewSchema = z
  .object({
    registrationId: z.uuid(),
    policyId: z.uuid(),
    templateId: z.uuid(),
    certificateNumber: line(64).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/),
    issueDate: z.iso.date(),
    authorityReference: line(200),
  })
  .strict();
export type AdmissionLetterPreview = z.infer<typeof admissionLetterPreviewSchema>;
