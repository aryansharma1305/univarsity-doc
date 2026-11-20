import { z } from 'zod';

/**
 * Student uploads: academic and identity documents a student uploads about themself, one file per
 * category. Files only — identity numbers are never stored as data. Visible to the owning student
 * and to staff with `studentUploads.read`.
 */
export const STUDENT_UPLOAD_GROUPS = {
  ACADEMIC: [
    'ACADEMIC_CLASS_10',
    'ACADEMIC_CLASS_12',
    'ACADEMIC_BACHELORS',
    'ACADEMIC_MASTERS',
    'ACADEMIC_OTHER',
  ],
  IDENTITY: [
    'IDENTITY_NATIONAL_ID',
    'IDENTITY_PASSPORT',
    'IDENTITY_PAN',
    'IDENTITY_DRIVING_LICENCE',
    'IDENTITY_OTHER',
  ],
} as const;

export const STUDENT_UPLOAD_CATEGORIES = [
  ...STUDENT_UPLOAD_GROUPS.ACADEMIC,
  ...STUDENT_UPLOAD_GROUPS.IDENTITY,
] as const;
export const studentUploadCategorySchema = z.enum(STUDENT_UPLOAD_CATEGORIES);
export type StudentUploadCategory = z.infer<typeof studentUploadCategorySchema>;

export const STUDENT_UPLOAD_CATEGORY_LABELS: Record<StudentUploadCategory, string> = {
  ACADEMIC_CLASS_10: 'Class 10 / School Certificate',
  ACADEMIC_CLASS_12: 'Class 12 / Higher Secondary',
  ACADEMIC_BACHELORS: 'Bachelor’s Degree',
  ACADEMIC_MASTERS: 'Master’s Degree',
  ACADEMIC_OTHER: 'Others',
  IDENTITY_NATIONAL_ID: 'National ID',
  IDENTITY_PASSPORT: 'Passport',
  IDENTITY_PAN: 'PAN Card',
  IDENTITY_DRIVING_LICENCE: 'Driving Licence',
  IDENTITY_OTHER: 'Other Identity Proof',
};

/** One uploaded file. No storage key, file name or content is ever returned. */
export const studentUploadSchema = z.object({
  id: z.uuid(),
  category: studentUploadCategorySchema,
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  sizeBytes: z.number().int().positive(),
  uploadedAt: z.iso.datetime(),
});
export type StudentUpload = z.infer<typeof studentUploadSchema>;

export const studentUploadListSchema = z.object({ data: z.array(studentUploadSchema) });
export type StudentUploadList = z.infer<typeof studentUploadListSchema>;
