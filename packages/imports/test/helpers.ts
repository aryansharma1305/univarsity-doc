import type { RuleDepartment, RuleProgram, RuleSession } from '@docversity/validation';
import type { ExistingRegistration, ReferenceData } from '../src/index.js';

type Named<T> = T & { name: string };

export const DEPT: Named<RuleDepartment> = {
  id: 'd0000000-0000-7000-8000-000000000001',
  code: 'DEV-CSE',
  name: 'Test School of Computing',
  status: 'ACTIVE',
};
export const OTHER_DEPT: Named<RuleDepartment> = {
  id: 'd0000000-0000-7000-8000-000000000002',
  code: 'DEV-MBA-DEPT',
  name: 'Test School of Management',
  status: 'ACTIVE',
};
export const INACTIVE_DEPT: Named<RuleDepartment> = {
  id: 'd0000000-0000-7000-8000-000000000003',
  code: 'DEV-OLD',
  name: 'Test Old Department',
  status: 'INACTIVE',
};
export const PROGRAM: Named<RuleProgram> = {
  id: '90000000-0000-7000-8000-000000000001',
  code: 'DEV-BTECH-CSE',
  name: 'Certificate in Test Ultrasonography',
  status: 'ACTIVE',
  department: DEPT,
};
export const MBA: Named<RuleProgram> = {
  id: '90000000-0000-7000-8000-000000000002',
  code: 'DEV-MBA',
  name: 'Test Management Program',
  status: 'ACTIVE',
  department: OTHER_DEPT,
};
export const LOOSE: Named<RuleProgram> = {
  id: '90000000-0000-7000-8000-000000000003',
  code: 'DEV-OPEN',
  name: 'Test Open Program',
  status: 'ACTIVE',
  department: null,
};
export const INACTIVE_PROGRAM: Named<RuleProgram> = {
  id: '90000000-0000-7000-8000-000000000004',
  code: 'DEV-RETIRED',
  name: 'Test Retired Program',
  status: 'INACTIVE',
  department: null,
};
export const SESSION: Named<RuleSession> = {
  id: '50000000-0000-7000-8000-000000000001',
  code: 'DEV-2026-27',
  name: 'Test Session 2026-27',
  status: 'ACTIVE',
};
export const OTHER_SESSION: Named<RuleSession> = {
  id: '50000000-0000-7000-8000-000000000002',
  code: 'DEV-2027-28',
  name: 'Test Session 2027-28',
  status: 'UPCOMING',
};
export const ARCHIVED: Named<RuleSession> = {
  id: '50000000-0000-7000-8000-000000000003',
  code: 'DEV-2001-02',
  name: 'Test Session 2001-02',
  status: 'ARCHIVED',
};

export const REFERENCES: ReferenceData = {
  programs: [PROGRAM, MBA, LOOSE, INACTIVE_PROGRAM],
  sessions: [SESSION, OTHER_SESSION, ARCHIVED],
  departments: [DEPT, OTHER_DEPT, INACTIVE_DEPT],
};

export function existingRegistration(
  overrides: Partial<ExistingRegistration> = {},
): ExistingRegistration {
  return {
    id: 'r0000000-0000-7000-8000-000000000001',
    studentId: 'u0000000-0000-7000-8000-000000000001',
    registrationNumber: 'DEV-IMPORT-0001',
    registrationNumberNormalized: 'DEV-IMPORT-0001',
    rollReferenceNumber: 'DEV-ROLL-0001',
    program: { id: PROGRAM.id, code: PROGRAM.code },
    department: { id: DEPT.id, code: DEPT.code },
    academicSession: { id: SESSION.id, code: SESSION.code },
    admissionDate: '2026-08-01',
    completionDate: null,
    status: 'ACTIVE',
    student: {
      fullName: 'Test Student One',
      fatherName: 'Test Father One',
      motherName: null,
      dateOfBirth: '2004-01-15',
      gender: 'Female',
    },
    ...overrides,
  };
}
