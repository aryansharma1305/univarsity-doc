import { z } from 'zod';
import {
  activityItemSchema,
  dateOnlySchema,
  listQuerySchema,
  optionalFilter,
  paginatedSchema,
} from '../academic/common.js';

/**
 * Student profile change requests (Phase 7). A student proposes corrections to their own personal
 * details (and a photo); staff approve or reject. Official records change only on approval.
 */

export const PROFILE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export const profileRequestStatusSchema = z.enum(PROFILE_REQUEST_STATUSES);

/** Personal fields a student may propose. Academic/registration data is never student-editable. */
export const PROFILE_REQUEST_FIELDS = [
  'fullName',
  'fatherName',
  'motherName',
  'gender',
  'dateOfBirth',
] as const;
export const profileRequestFieldSchema = z.enum(PROFILE_REQUEST_FIELDS);

export const PROFILE_FIELD_LABELS: Record<ProfileRequestField, string> = {
  fullName: 'Full name',
  fatherName: "Father's name",
  motherName: "Mother's name",
  gender: 'Gender',
  dateOfBirth: 'Date of birth',
};

/** Values a student can choose for gender (staff may hold other historic values). */
export const GENDER_OPTIONS = ['Female', 'Male', 'Transgender', 'Other'] as const;

/** Server-side photo rules (the API decodes and re-encodes every photo; these are the hard limits). */
export const PROFILE_PHOTO_RULES = {
  maxBytes: 5 * 1024 * 1024,
  minWidth: 200,
  minHeight: 200,
  maxWidth: 8_000,
  maxHeight: 8_000,
  /** Accepted declared types. The decoded content must also be one of these formats. */
  acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  /** Stored size: the longest side is reduced to at most this many pixels. */
  storedMaxSide: 1_200,
} as const;

export const MIN_STUDENT_AGE_YEARS = 10;
export const MAX_STUDENT_AGE_YEARS = 100;

/** True when a YYYY-MM-DD date of birth gives an age between the limits on `today`. */
export function isPlausibleDateOfBirth(value: string, today = new Date()): boolean {
  const year = today.getUTCFullYear();
  const todayIso = today.toISOString().slice(0, 10);
  const shift = (years: number) => `${String(year - years).padStart(4, '0')}${todayIso.slice(4)}`;
  return value <= shift(MIN_STUDENT_AGE_YEARS) && value >= shift(MAX_STUDENT_AGE_YEARS);
}

const personName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}.`)
    .max(200, 'Use at most 200 characters.')
    .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, 'Use letters, spaces, ".", "\'" or "-" only.');

/** Proposed values. Every present field must be a real value — requests never clear a field. */
export const profileChangesSchema = z
  .object({
    fullName: personName('full name').optional(),
    fatherName: personName("father's name").optional(),
    motherName: personName("mother's name").optional(),
    gender: z.enum(GENDER_OPTIONS, { error: 'Choose a gender.' }).optional(),
    dateOfBirth: dateOnlySchema
      .refine((value) => isPlausibleDateOfBirth(value), {
        message: `Enter a date of birth between ${MAX_STUDENT_AGE_YEARS} and ${MIN_STUDENT_AGE_YEARS} years ago.`,
      })
      .optional(),
  })
  .strict()
  .meta({ id: 'ProfileChanges' });

/** The non-file part of a submission (multipart fields `changes` (JSON) and `note`). */
export const submitProfileRequestSchema = z
  .object({
    changes: profileChangesSchema.default({}),
    note: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().max(500, 'Use at most 500 characters.').optional(),
    ),
  })
  .strict()
  .meta({ id: 'SubmitProfileRequest' });

export const rejectProfileRequestSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, 'Explain why the request is rejected (at least 5 characters).')
      .max(1000, 'Use at most 1000 characters.'),
  })
  .strict()
  .meta({ id: 'RejectProfileRequest' });

export const approveProfileRequestSchema = z
  .object({})
  .strict()
  .meta({ id: 'ApproveProfileRequest' });

const fieldChangeSchema = z.object({
  field: profileRequestFieldSchema,
  /** Official value when the request was submitted. */
  previous: z.string().nullable(),
  proposed: z.string(),
});

const photoInfoSchema = z.object({
  width: z.number().int(),
  height: z.number().int(),
  sizeBytes: z.number().int(),
});

/** A request as its own student sees it (no reviewer identity, no storage keys). */
export const studentProfileRequestSchema = z
  .object({
    id: z.uuid(),
    status: profileRequestStatusSchema,
    submittedAt: z.iso.datetime(),
    decidedAt: z.iso.datetime().nullable(),
    changes: z.array(fieldChangeSchema),
    photo: photoInfoSchema.nullable(),
    note: z.string().nullable(),
    rejectionReason: z.string().nullable(),
  })
  .meta({ id: 'StudentProfileRequest' });

export const studentProfileRequestListSchema = z
  .object({ data: z.array(studentProfileRequestSchema) })
  .meta({ id: 'StudentProfileRequestList' });

const reviewerSchema = z.object({ id: z.uuid(), displayName: z.string() }).nullable();

export const profileRequestRowSchema = z
  .object({
    id: z.uuid(),
    status: profileRequestStatusSchema,
    submittedAt: z.iso.datetime(),
    reviewedAt: z.iso.datetime().nullable(),
    cancelledAt: z.iso.datetime().nullable(),
    student: z.object({ id: z.uuid(), fullName: z.string() }),
    registrationNumbers: z.array(z.string()),
    fields: z.array(profileRequestFieldSchema),
    hasPhoto: z.boolean(),
    reviewer: reviewerSchema,
  })
  .meta({ id: 'ProfileRequestRow' });

export const profileRequestListSchema = paginatedSchema(profileRequestRowSchema).meta({
  id: 'ProfileRequestList',
});

export const PROFILE_REQUEST_SORT_FIELDS = ['submittedAt'] as const;
/** Default: oldest first, so the review queue is worked in submission order. */
export const profileRequestQuerySchema = listQuerySchema(
  PROFILE_REQUEST_SORT_FIELDS,
  'submittedAt',
  { status: optionalFilter(profileRequestStatusSchema) },
);

export const profileRequestDetailSchema = profileRequestRowSchema
  .extend({
    changes: z.array(
      fieldChangeSchema.extend({
        /** The official value now (differs from `previous` if the record changed since). */
        current: z.string().nullable(),
        changedSinceSubmission: z.boolean(),
      }),
    ),
    photo: photoInfoSchema.extend({ officialPhotoChangedSinceSubmission: z.boolean() }).nullable(),
    hasOfficialPhoto: z.boolean(),
    /** True when any requested value changed after submission: approval is refused. */
    stale: z.boolean(),
    note: z.string().nullable(),
    rejectionReason: z.string().nullable(),
    history: z.array(activityItemSchema),
    otherRequests: z.array(
      z.object({ id: z.uuid(), status: profileRequestStatusSchema, submittedAt: z.iso.datetime() }),
    ),
  })
  .meta({ id: 'ProfileRequestDetail' });

export const profilePhotoVariantSchema = z.enum(['proposed', 'official']);

export type ProfileRequestStatus = z.infer<typeof profileRequestStatusSchema>;
export type ProfileRequestField = z.infer<typeof profileRequestFieldSchema>;
export type ProfileChanges = z.infer<typeof profileChangesSchema>;
export type ProfileChangesInput = z.input<typeof profileChangesSchema>;
export type SubmitProfileRequest = z.infer<typeof submitProfileRequestSchema>;
export type RejectProfileRequest = z.infer<typeof rejectProfileRequestSchema>;
export type StudentProfileRequest = z.infer<typeof studentProfileRequestSchema>;
export type StudentProfileRequestList = z.infer<typeof studentProfileRequestListSchema>;
export type ProfileRequestRow = z.infer<typeof profileRequestRowSchema>;
export type ProfileRequestList = z.infer<typeof profileRequestListSchema>;
export type ProfileRequestQuery = z.infer<typeof profileRequestQuerySchema>;
export type ProfileRequestDetail = z.infer<typeof profileRequestDetailSchema>;
export type ProfilePhotoVariant = z.infer<typeof profilePhotoVariantSchema>;
