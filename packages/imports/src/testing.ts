import ExcelJS from 'exceljs';
import { STUDENT_IMPORT_FIELDS } from '@docversity/validation';

/**
 * Programmatic workbook fixtures for tests (unit, API integration, e2e and the performance check).
 * No spreadsheet with real data is ever committed: every fixture is generated from obvious
 * development values such as DEV-IMPORT-0001 / "Test Student One".
 */
export type FixtureCell =
  | string
  | number
  | boolean
  | Date
  | null
  | { formula: string; result?: string | number }
  | { error: '#N/A' | '#REF!' | '#VALUE!' | '#DIV/0!' };

export interface FixtureSheet {
  name: string;
  rows: FixtureCell[][];
}

export async function buildWorkbook(sheets: readonly FixtureSheet[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    sheet.rows.forEach((cells, rowIndex) => {
      cells.forEach((value, columnIndex) => {
        if (value === null) return;
        const cell = worksheet.getCell(rowIndex + 1, columnIndex + 1);
        if (value instanceof Date) {
          cell.value = value;
          cell.numFmt = 'yyyy-mm-dd';
        } else {
          cell.value = value;
        }
      });
    });
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** Template header labels, in template order. */
export const STUDENT_TEMPLATE_HEADERS: readonly string[] = STUDENT_IMPORT_FIELDS.map(
  (field) => field.label,
);

export interface FixtureStudent {
  registrationNumber?: FixtureCell;
  rollReferenceNumber?: FixtureCell;
  fullName?: FixtureCell;
  fatherName?: FixtureCell;
  motherName?: FixtureCell;
  dateOfBirth?: FixtureCell;
  gender?: FixtureCell;
  programCode?: FixtureCell;
  departmentCode?: FixtureCell;
  academicSessionCode?: FixtureCell;
  admissionDate?: FixtureCell;
  completionDate?: FixtureCell;
  status?: FixtureCell;
}

/** One row in template column order. */
export function studentRow(student: FixtureStudent): FixtureCell[] {
  return STUDENT_IMPORT_FIELDS.map((field) => student[field.key] ?? null);
}

/** A "Students" sheet with the template headers and the given rows. */
export function studentSheet(students: readonly FixtureStudent[], name = 'Students'): FixtureSheet {
  return { name, rows: [[...STUDENT_TEMPLATE_HEADERS], ...students.map(studentRow)] };
}

/** `count` obviously fictitious, valid students for the given program and session codes. */
export function generatedStudents(
  count: number,
  options: { prefix?: string; programCode: string; academicSessionCode: string; start?: number },
): FixtureStudent[] {
  const prefix = options.prefix ?? 'DEV-IMPORT';
  const start = options.start ?? 1;
  return Array.from({ length: count }, (_, index) => {
    const number = String(start + index).padStart(4, '0');
    return {
      registrationNumber: `${prefix}-${number}`,
      rollReferenceNumber: `${prefix}-ROLL-${number}`,
      fullName: `Test Student ${number}`,
      fatherName: `Test Father ${number}`,
      dateOfBirth: '2004-01-15',
      gender: index % 2 === 0 ? 'Female' : 'Male',
      programCode: options.programCode,
      academicSessionCode: options.academicSessionCode,
      admissionDate: '2026-08-01',
      status: 'ACTIVE',
    };
  });
}

/** Column headers of the university's "Registration 2025" workbook (structure only — no data). */
export const REGISTRATION_2025_HEADERS = [
  'S.No',
  'Name',
  'Admission Date',
  'Registration No.',
  'Registration Date',
  'Date of Birth',
  'Nationality',
  'National Id No.',
  'Course Type',
  'Course Name',
  'Duration',
  'School Name',
  'Registration Status',
  'Photo',
] as const;

export interface Registration2025Row {
  name: string;
  registrationNumber: number | string;
  courseName: string;
  schoolName: string;
  status: string;
  admissionDate?: Date;
  dateOfBirth?: Date | null;
}

/**
 * A synthetic workbook with the same shape as "Registration 2025.xlsx": sheet "Registration List",
 * numeric registration numbers, real date cells, an always-empty Date of Birth and Photo, trailing
 * spaces in course/status values, and a national-ID column filled with obviously fake values.
 */
export function registration2025Sheet(rows: readonly Registration2025Row[]): FixtureSheet {
  return {
    name: 'Registration List',
    rows: [
      [...REGISTRATION_2025_HEADERS],
      ...rows.map((row, index): FixtureCell[] => [
        index + 1,
        row.name,
        row.admissionDate ?? new Date(Date.UTC(2025, 6, 1)),
        row.registrationNumber,
        new Date(Date.UTC(2025, 6, 5)),
        row.dateOfBirth ?? null,
        'Testland',
        `TEST-NATIONAL-ID-${String(index + 1).padStart(4, '0')}`,
        'Training',
        `${row.courseName} `,
        '6 Months ',
        row.schoolName,
        `${row.status} `,
        null,
      ]),
    ],
  };
}
