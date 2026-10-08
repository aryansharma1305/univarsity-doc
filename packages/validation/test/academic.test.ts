import { describe, expect, it } from 'vitest';
import {
  createAcademicSessionSchema,
  createProgramSchema,
  createStudentSchema,
  departmentQuerySchema,
  normalizeRegistrationNumber,
  updateDepartmentSchema,
  updateRegistrationSchema,
} from '../src/index.js';

describe('list query contract', () => {
  it('applies defaults', () => {
    expect(departmentQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      sortBy: 'code',
      sortOrder: 'asc',
    });
  });

  it('coerces query strings and treats blanks as absent', () => {
    expect(
      departmentQuerySchema.parse({
        page: '2',
        pageSize: '50',
        search: '  ',
        status: '',
        sortOrder: 'desc',
      }),
    ).toEqual({ page: 2, pageSize: 50, sortBy: 'code', sortOrder: 'desc' });
  });

  it('rejects sort fields that are not allow-listed', () => {
    expect(departmentQuerySchema.safeParse({ sortBy: 'password_hash' }).success).toBe(false);
    expect(departmentQuerySchema.safeParse({ sortBy: 'name; DROP TABLE x' }).success).toBe(false);
  });

  it('rejects unknown parameters and out-of-range paging', () => {
    expect(departmentQuerySchema.safeParse({ orderBy: 'id' }).success).toBe(false);
    expect(departmentQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false);
    expect(departmentQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('master data schemas', () => {
  it('requires at least one field in an update', () => {
    expect(updateDepartmentSchema.safeParse({}).success).toBe(false);
    expect(updateDepartmentSchema.safeParse({ name: 'Physics' }).success).toBe(true);
  });

  it('rejects codes with spaces and keeps optional program fields optional', () => {
    expect(createProgramSchema.safeParse({ code: 'B TECH', name: 'x' }).success).toBe(false);
    expect(
      createProgramSchema.parse({
        code: 'BTECH-CSE',
        name: 'B.Tech CSE',
        level: '',
        durationSemesters: '',
      }),
    ).toEqual({
      code: 'BTECH-CSE',
      name: 'B.Tech CSE',
      level: null,
      status: 'ACTIVE',
    });
  });

  it('requires session dates in order', () => {
    const result = createAcademicSessionSchema.safeParse({
      code: '2026-27',
      name: '2026–27',
      startsOn: '2026-07-01',
      endsOn: '2026-06-30',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['endsOn']);
  });
});

describe('student schemas', () => {
  const valid = {
    student: { fullName: 'Test Student', dateOfBirth: '' },
    registration: {
      registrationNumber: 'REG/2026/001',
      programId: '01900000-0000-7000-8000-000000000001',
      academicSessionId: '01900000-0000-7000-8000-000000000002',
    },
  };

  it('does not require a date of birth', () => {
    const parsed = createStudentSchema.parse(valid);
    expect(parsed.student.dateOfBirth).toBeNull();
    expect(parsed.registration.status).toBe('ACTIVE');
  });

  it('requires completion on or after admission', () => {
    const result = updateRegistrationSchema.safeParse({
      admissionDate: '2026-07-01',
      completionDate: '2025-07-01',
    });
    expect(result.success).toBe(false);
  });

  it('normalises registration numbers the same way as the database', () => {
    expect(normalizeRegistrationNumber('  reg/2026/001 ')).toBe('REG/2026/001');
  });
});
