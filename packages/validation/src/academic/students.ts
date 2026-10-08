import { z } from 'zod';
import {
  activityItemSchema,
  atLeastOneField,
  listQuerySchema,
  optionalDateSchema,
  optionalFilter,
  optionalText,
  optionalUuidSchema,
  paginatedSchema,
  refSchema,
  studentStatusSchema,
} from './common.js';

// ------------------------------------------------------------------------------------------
// Registrations
// ------------------------------------------------------------------------------------------

/** Registration number as issued: trimmed, 1–64 printable characters (case is preserved). */
export const registrationNumberSchema = z
  .string()
  .trim()
  .min(1, 'Enter the registration number.')
  .max(64, 'Use at most 64 characters.')
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u, 'Use letters, digits, spaces, ".", "_", "/" or "-".');

/** How registration numbers are compared (matches the database CHECK constraint). */
export function normalizeRegistrationNumber(value: string): string {
  return value.trim().toUpperCase();
}

const COMPLETION_ORDER_MESSAGE = 'The completion date must be on or after the admission date.';

export function registrationDatesInOrder(
  admissionDate?: string | null,
  completionDate?: string | null,
): boolean {
  return !admissionDate || !completionDate || completionDate >= admissionDate;
}

const registrationFields = {
  registrationNumber: registrationNumberSchema,
  /** Meaning is university-specific (roll number, enrolment reference, …); stored as given. */
  rollReferenceNumber: optionalText(64),
  programId: z.uuid({ error: 'Choose a program.' }),
  departmentId: optionalUuidSchema,
  academicSessionId: z.uuid({ error: 'Choose an academic session.' }),
  admissionDate: optionalDateSchema,
  completionDate: optionalDateSchema,
  status: studentStatusSchema.default('ACTIVE'),
};

/** Registration fields when creating a student and their first registration together. */
export const newRegistrationSchema = z
  .object(registrationFields)
  .strict()
  .refine((value) => registrationDatesInOrder(value.admissionDate, value.completionDate), {
    message: COMPLETION_ORDER_MESSAGE,
    path: ['completionDate'],
  });

export const createRegistrationSchema = z
  .object({ studentId: z.uuid(), ...registrationFields })
  .strict()
  .refine((value) => registrationDatesInOrder(value.admissionDate, value.completionDate), {
    message: COMPLETION_ORDER_MESSAGE,
    path: ['completionDate'],
  })
  .meta({ id: 'CreateRegistration' });

export const updateRegistrationSchema = atLeastOneField(
  z
    .object({
      registrationNumber: registrationNumberSchema.optional(),
      rollReferenceNumber: optionalText(64),
      programId: z.uuid().optional(),
      departmentId: optionalUuidSchema,
      academicSessionId: z.uuid().optional(),
      admissionDate: optionalDateSchema,
      completionDate: optionalDateSchema,
      status: studentStatusSchema.optional(),
    })
    .strict(),
)
  .refine((value) => registrationDatesInOrder(value.admissionDate, value.completionDate), {
    message: COMPLETION_ORDER_MESSAGE,
    path: ['completionDate'],
  })
  .meta({ id: 'UpdateRegistration' });

export const registrationSchema = z
  .object({
    id: z.uuid(),
    studentId: z.uuid(),
    studentName: z.string(),
    registrationNumber: z.string(),
    rollReferenceNumber: z.string().nullable(),
    program: refSchema,
    department: refSchema.nullable(),
    academicSession: refSchema,
    admissionDate: z.iso.date().nullable(),
    completionDate: z.iso.date().nullable(),
    status: studentStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Registration' });

export const registrationListSchema = paginatedSchema(registrationSchema).meta({
  id: 'RegistrationList',
});

export const REGISTRATION_SORT_FIELDS = [
  'registrationNumber',
  'status',
  'updatedAt',
  'createdAt',
] as const;
export const registrationQuerySchema = listQuerySchema(
  REGISTRATION_SORT_FIELDS,
  'registrationNumber',
  {
    status: optionalFilter(studentStatusSchema),
    programId: optionalFilter(z.uuid()),
    academicSessionId: optionalFilter(z.uuid()),
    studentId: optionalFilter(z.uuid()),
  },
);

// ------------------------------------------------------------------------------------------
// Students
// ------------------------------------------------------------------------------------------

export const studentPersonalFields = {
  fullName: z
    .string()
    .trim()
    .min(1, 'Enter the full name.')
    .max(200, 'Use at most 200 characters.'),
  fatherName: optionalText(200),
  motherName: optionalText(200),
  /** Optional. Not a lookup factor (the public second identifier is unconfirmed). */
  dateOfBirth: optionalDateSchema,
  gender: optionalText(32),
};

export const studentPersonalSchema = z.object(studentPersonalFields).strict();

/** Creates a student and their first registration in one transaction. */
export const createStudentSchema = z
  .object({ student: studentPersonalSchema, registration: newRegistrationSchema })
  .strict()
  .meta({ id: 'CreateStudent' });

export const updateStudentSchema = atLeastOneField(
  z
    .object({
      fullName: studentPersonalFields.fullName.optional(),
      fatherName: studentPersonalFields.fatherName,
      motherName: studentPersonalFields.motherName,
      dateOfBirth: studentPersonalFields.dateOfBirth,
      gender: studentPersonalFields.gender,
    })
    .strict(),
).meta({ id: 'UpdateStudent' });

const registrationSummarySchema = z.object({
  id: z.uuid(),
  registrationNumber: z.string(),
  status: studentStatusSchema,
  program: refSchema,
  academicSession: refSchema,
});

export const studentListItemSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    /** The most recently created registration (null if the student has none). */
    latestRegistration: registrationSummarySchema.nullable(),
    registrationCount: z.number().int(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'StudentListItem' });

export const studentListSchema = paginatedSchema(studentListItemSchema).meta({ id: 'StudentList' });

export const studentDetailSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    fatherName: z.string().nullable(),
    motherName: z.string().nullable(),
    dateOfBirth: z.iso.date().nullable(),
    gender: z.string().nullable(),
    hasPhoto: z.boolean(),
    registrations: z.array(registrationSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'StudentDetail' });

export const STUDENT_SORT_FIELDS = ['fullName', 'updatedAt', 'createdAt'] as const;
export const studentQuerySchema = listQuerySchema(STUDENT_SORT_FIELDS, 'fullName', {
  /** Filters apply to the student's registrations. */
  status: optionalFilter(studentStatusSchema),
  programId: optionalFilter(z.uuid()),
  academicSessionId: optionalFilter(z.uuid()),
});

export const activityListSchema = z
  .object({ data: z.array(activityItemSchema) })
  .meta({ id: 'ActivityList' });

export type Registration = z.infer<typeof registrationSchema>;
export type RegistrationList = z.infer<typeof registrationListSchema>;
export type CreateRegistration = z.infer<typeof createRegistrationSchema>;
export type CreateRegistrationInput = z.input<typeof createRegistrationSchema>;
export type NewRegistration = z.infer<typeof newRegistrationSchema>;
export type UpdateRegistration = z.infer<typeof updateRegistrationSchema>;
export type RegistrationQuery = z.infer<typeof registrationQuerySchema>;
export type CreateStudent = z.infer<typeof createStudentSchema>;
export type CreateStudentInput = z.input<typeof createStudentSchema>;
export type UpdateStudent = z.infer<typeof updateStudentSchema>;
export type StudentListItem = z.infer<typeof studentListItemSchema>;
export type StudentList = z.infer<typeof studentListSchema>;
export type StudentDetail = z.infer<typeof studentDetailSchema>;
export type StudentQuery = z.infer<typeof studentQuerySchema>;
export type ActivityList = z.infer<typeof activityListSchema>;
