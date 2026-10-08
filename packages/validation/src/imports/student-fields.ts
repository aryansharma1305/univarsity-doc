/**
 * The columns a student import understands. Shared by the template generator, the deterministic
 * header-matching suggestions, the worker's row validation and the web wizard (labels/help).
 *
 * Required = minimum to import a registration. Every other column is optional and only used when
 * mapped. Department is optional because the domain allows registrations without one (it is derived
 * from the program when the program belongs to a department).
 */
export const STUDENT_IMPORT_FIELD_KEYS = [
  'registrationNumber',
  'rollReferenceNumber',
  'fullName',
  'fatherName',
  'motherName',
  'dateOfBirth',
  'gender',
  'programCode',
  'departmentCode',
  'academicSessionCode',
  'admissionDate',
  'completionDate',
  'status',
] as const;

export type StudentImportField = (typeof STUDENT_IMPORT_FIELD_KEYS)[number];

export type StudentImportFieldKind = 'text' | 'date' | 'code' | 'status';

export interface StudentImportFieldDefinition {
  key: StudentImportField;
  /** Template header and UI label. */
  label: string;
  required: boolean;
  kind: StudentImportFieldKind;
  maxLength?: number;
  description: string;
  /** Obvious development example shown in the template. */
  example: string;
  /**
   * Normalised header spellings that suggest this field (see `normalizeImportHeader`). Matching is
   * exact on the normalised form — deterministic, reviewable, no AI.
   */
  aliases: readonly string[];
}

export const STUDENT_IMPORT_FIELDS: readonly StudentImportFieldDefinition[] = [
  {
    key: 'registrationNumber',
    label: 'Registration Number',
    required: true,
    kind: 'text',
    maxLength: 64,
    description:
      'Official registration number as issued. Compared without regard to case or surrounding spaces. Identifies existing registrations.',
    example: 'DEV-IMPORT-0001',
    aliases: [
      'registration number',
      'registration no',
      'registration num',
      'registration',
      'reg number',
      'reg no',
      'reg num',
      'regn no',
      'regd no',
      'registrationnumber',
      'regno',
    ],
  },
  {
    key: 'rollReferenceNumber',
    label: 'Roll / Reference Number',
    required: false,
    kind: 'text',
    maxLength: 64,
    description: 'Optional roll or enrolment reference used by the university. Stored as given.',
    example: 'DEV-ROLL-0001',
    aliases: [
      'roll reference number',
      'roll number',
      'roll no',
      'roll num',
      'rollno',
      'reference number',
      'reference no',
      'ref no',
      'roll reference no',
    ],
  },
  {
    key: 'fullName',
    label: 'Student Name',
    required: true,
    kind: 'text',
    maxLength: 200,
    description: 'Full name of the student.',
    example: 'Test Student One',
    aliases: [
      'student name',
      'name',
      'full name',
      'name of student',
      'student full name',
      'candidate name',
    ],
  },
  {
    key: 'fatherName',
    label: 'Father Name',
    required: false,
    kind: 'text',
    maxLength: 200,
    description: "Optional. Father's name.",
    example: 'Test Father One',
    aliases: ['father name', 'fathers name', 'father s name', 'name of father'],
  },
  {
    key: 'motherName',
    label: 'Mother Name',
    required: false,
    kind: 'text',
    maxLength: 200,
    description: "Optional. Mother's name.",
    example: 'Test Mother One',
    aliases: ['mother name', 'mothers name', 'mother s name', 'name of mother'],
  },
  {
    key: 'dateOfBirth',
    label: 'Date of Birth',
    required: false,
    kind: 'date',
    description: 'Optional. A real Excel date cell or text in YYYY-MM-DD.',
    example: '2004-01-15',
    aliases: ['date of birth', 'dob', 'birth date', 'birthdate', 'd o b'],
  },
  {
    key: 'gender',
    label: 'Gender',
    required: false,
    kind: 'text',
    maxLength: 32,
    description: 'Optional. Stored as given (up to 32 characters).',
    example: 'Female',
    aliases: ['gender', 'sex'],
  },
  {
    key: 'programCode',
    label: 'Program Code',
    required: true,
    kind: 'code',
    maxLength: 200,
    description:
      'Code or name of an existing program (see Programs), e.g. a course name. Values can also be matched to programs explicitly while mapping. Missing programs are never created.',
    example: 'DEV-BTECH-CSE',
    aliases: [
      'program code',
      'programme code',
      'program',
      'programme',
      'program name',
      'programme name',
      'course code',
      'course',
      'course name',
    ],
  },
  {
    key: 'departmentCode',
    label: 'Department Code',
    required: false,
    kind: 'code',
    maxLength: 200,
    description:
      'Optional code or name of an existing department (a school name can be matched to a department while mapping). If the program belongs to a department, it must be that department (or empty; it is then filled in from the program).',
    example: 'DEV-CSE',
    aliases: [
      'department code',
      'department',
      'department name',
      'dept code',
      'dept',
      'school',
      'school name',
    ],
  },
  {
    key: 'academicSessionCode',
    label: 'Academic Session Code',
    required: true,
    kind: 'code',
    maxLength: 120,
    description:
      'Code or name of an existing, non-archived academic session. If the file has no session column, choose one session for every row while mapping.',
    example: 'DEV-2026-27',
    aliases: [
      'academic session code',
      'academic session',
      'session code',
      'session',
      'batch',
      'academic year',
    ],
  },
  {
    key: 'admissionDate',
    label: 'Admission Date',
    required: false,
    kind: 'date',
    description: 'Optional. A real Excel date cell or text in YYYY-MM-DD.',
    example: '2026-08-01',
    aliases: [
      'admission date',
      'date of admission',
      'admitted on',
      'enrolment date',
      'enrollment date',
    ],
  },
  {
    key: 'completionDate',
    label: 'Completion Date',
    required: false,
    kind: 'date',
    description: 'Optional. Must be on or after the admission date.',
    example: '2030-06-30',
    aliases: [
      'completion date',
      'date of completion',
      'completed on',
      'passing date',
      'date of passing',
    ],
  },
  {
    key: 'status',
    label: 'Status',
    required: false,
    kind: 'status',
    description:
      "Optional. ACTIVE, COMPLETED, SUSPENDED or REVOKED (not case-sensitive); other values (e.g. 'Inactive') can be translated while mapping. Empty = ACTIVE for new registrations.",
    example: 'ACTIVE',
    aliases: ['status', 'registration status', 'student status'],
  },
];

/** Fields whose cell values can be translated with an explicit per-import value map. */
export const VALUE_MAPPED_FIELDS = [
  'programCode',
  'departmentCode',
  'academicSessionCode',
  'status',
] as const;
export type ValueMappedField = (typeof VALUE_MAPPED_FIELDS)[number];

/**
 * Headers of columns that must never be imported, mapped, previewed or kept in staging rows
 * (government identity numbers and similar). Matched on the normalised header.
 */
const SENSITIVE_HEADER =
  /\b(national id|aadhaa?r|aadhar|uid|uidai|passport|pan( no| number| card)?|ssn|social security|voter id|tax id)\b/;

export function isSensitiveImportHeader(header: string): boolean {
  return SENSITIVE_HEADER.test(normalizeImportHeader(header));
}

/** How cell values are compared with value-map keys: trimmed, whitespace collapsed, upper-case. */
export function normalizeImportValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export const STUDENT_IMPORT_REQUIRED_FIELDS: readonly StudentImportField[] =
  STUDENT_IMPORT_FIELDS.filter((field) => field.required).map((field) => field.key);

export function studentImportField(key: StudentImportField): StudentImportFieldDefinition {
  const field = STUDENT_IMPORT_FIELDS.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`Unknown student import field ${key}`);
  return field;
}

/**
 * Header normalisation used for mapping suggestions: lower-case, accents removed, every run of
 * non-alphanumeric characters (spaces, "_", ".", "/", "'", "#") becomes one space, trimmed.
 * "REG_NO." → "reg no"; "Registration No." → "registration no"; "Father's Name" → "father s name".
 */
export function normalizeImportHeader(header: string): string {
  return header
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
