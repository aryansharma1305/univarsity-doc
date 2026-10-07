import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  permissionsForRoles,
} from '../src/index.js';

const MUTATING = ALL_PERMISSIONS.filter((p) => !p.endsWith('.read'));

describe('role → permission mapping', () => {
  it('gives SUPER_ADMIN every permission', () => {
    expect([...permissionsForRoles([ROLE_NAMES.superAdmin])].sort()).toEqual(
      [...ALL_PERMISSIONS].sort(),
    );
  });

  it('keeps VIEWER read-only', () => {
    const viewer = permissionsForRoles([ROLE_NAMES.viewer]);
    expect([...viewer].every((p) => p.endsWith('.read'))).toBe(true);
    for (const permission of MUTATING) expect(viewer.has(permission)).toBe(false);
  });

  it('lets APPROVER approve/publish/issue/revoke but not prepare or import', () => {
    const approver = permissionsForRoles([ROLE_NAMES.approver]);
    for (const p of [
      PERMISSIONS.resultsPublish,
      PERMISSIONS.certificatesApprove,
      PERMISSIONS.certificatesIssue,
      PERMISSIONS.certificatesRevoke,
    ]) {
      expect(approver.has(p)).toBe(true);
    }
    for (const p of [
      PERMISSIONS.resultsWrite,
      PERMISSIONS.certificatesGenerate,
      PERMISSIONS.studentsWrite,
      PERMISSIONS.importsRun,
      PERMISSIONS.templatesWrite,
      PERMISSIONS.usersManage,
    ]) {
      expect(approver.has(p)).toBe(false);
    }
  });

  it('separates makers from checkers (no single non-admin role can prepare AND approve)', () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (role === ROLE_NAMES.superAdmin) continue;
      const set = new Set(permissions);
      expect(set.has(PERMISSIONS.resultsWrite) && set.has(PERMISSIONS.resultsPublish), role).toBe(
        false,
      );
      expect(
        set.has(PERMISSIONS.certificatesGenerate) && set.has(PERMISSIONS.certificatesIssue),
        role,
      ).toBe(false);
    }
  });

  it('only SUPER_ADMIN can manage users and settings', () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      const manages =
        permissions.includes(PERMISSIONS.usersManage) ||
        permissions.includes(PERMISSIONS.settingsManage);
      expect(manages, role).toBe(role === ROLE_NAMES.superAdmin);
    }
  });

  it('combines multiple roles and ignores unknown role names', () => {
    const combined = permissionsForRoles([ROLE_NAMES.viewer, ROLE_NAMES.examAdmin, 'NOT_A_ROLE']);
    expect(combined.has(PERMISSIONS.resultsWrite)).toBe(true);
    expect(permissionsForRoles(['NOT_A_ROLE']).size).toBe(0);
  });
});
