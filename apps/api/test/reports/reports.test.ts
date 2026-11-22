import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS, type Permission, ROLE_PERMISSIONS, type RoleName } from '@docversity/types';
import { REPORT_NAMES, type Report, type ReportName } from '@docversity/validation';
import {
  type Staff,
  createTestApp,
  errorOf,
  realConfig,
  staff,
  testDb,
  uniqueCode,
} from '../helpers.js';

const REPORT_PERMISSION: Record<ReportName, Permission> = {
  enrolment: PERMISSIONS.registrationsRead,
  'certificate-requests': PERMISSIONS.certificateRequestsRead,
  'issued-documents': PERMISSIONS.certificatesRead,
  results: PERMISSIONS.resultsRead,
  're-exam-applications': PERMISSIONS.reExamApplicationsRead,
  'verification-activity': PERMISSIONS.auditRead,
  'student-messages': PERMISSIONS.studentMessagesRead,
  'verification-queries': PERMISSIONS.verificationQueriesRead,
};

let app: INestApplication;
let admin: Staff;
const byRole = new Map<RoleName, Staff>();
let fixture: { programId: string; sessionId: string; programCode: string; studentName: string };

beforeAll(async () => {
  app = await createTestApp(realConfig());
  admin = await staff(app, ['SUPER_ADMIN']);
  for (const role of Object.keys(ROLE_PERMISSIONS) as RoleName[]) {
    byRole.set(role, await staff(app, [role]));
  }
  const programCode = uniqueCode('RPT');
  // A course name that would be a spreadsheet formula if exported unescaped.
  const program = (await admin.post('programs', { code: programCode, name: '=HYPERLINK("x")' }))
    .body as { id: string };
  const session = (
    await admin.post('academic-sessions', { code: uniqueCode('SES'), name: 'Report session' })
  ).body as { id: string };
  const studentName = `Synthetic Report Student ${uniqueCode('S')}`;
  for (const [index, status] of (['ACTIVE', 'ACTIVE', 'COMPLETED'] as const).entries()) {
    const created = await admin.post('students', {
      student: { fullName: `${studentName} ${index}` },
      registration: {
        registrationNumber: uniqueCode('REG'),
        programId: program.id,
        academicSessionId: session.id,
        status,
      },
    });
    expect(created.status).toBe(201);
  }
  fixture = { programId: program.id, sessionId: session.id, programCode, studentName };
});

afterAll(async () => {
  await app.close();
});

describe('reports', () => {
  it('is guarded per report by the module read permission', async () => {
    for (const name of REPORT_NAMES) {
      for (const [role, member] of byRole) {
        const allowed = ROLE_PERMISSIONS[role].includes(REPORT_PERMISSION[name]);
        const response = await member.get(`reports/${name}`);
        expect([name, role, response.status]).toEqual([name, role, allowed ? 200 : 403]);
      }
    }
  });

  it('counts real registrations by course, session and status, within the filters', async () => {
    const response = await admin
      .get(
        `reports/enrolment?programId=${fixture.programId}&academicSessionId=${fixture.sessionId}`,
      )
      .expect(200);
    const report = response.body as Report;
    expect(report.rows).toEqual([
      expect.objectContaining({
        courseCode: fixture.programCode,
        status: 'ACTIVE',
        registrations: 2,
      }),
      expect.objectContaining({
        courseCode: fixture.programCode,
        status: 'COMPLETED',
        registrations: 1,
      }),
    ]);
    expect(report.total).toBe(3);
    const active = (
      await admin.get(`reports/enrolment?programId=${fixture.programId}&status=ACTIVE`).expect(200)
    ).body as Report;
    expect(active.total).toBe(2);
    // Never personal data.
    expect(JSON.stringify(report)).not.toContain(fixture.studentName);
  });

  it('rejects filters a report does not support and inverted date ranges', async () => {
    const unsupported = await admin.get(
      'reports/certificate-requests?programId=' + fixture.programId,
    );
    expect(unsupported.status).toBe(400);
    const inverted = await admin.get('reports/student-messages?from=2026-11-20&to=2026-11-01');
    expect(errorOf(inverted).code).toBe('VALIDATION_FAILED');
    expect(inverted.status).toBe(400);
  });

  it('exports the same rows as CSV under the same permission, with formulas neutralised', async () => {
    const path = `reports/enrolment?programId=${fixture.programId}&format=csv`;
    const csv = await admin.get(path).buffer(true).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['cache-control']).toBe('no-store');
    expect(csv.headers['content-disposition']).toMatch(
      /^attachment; filename="docversity-enrolment-/,
    );
    const text = csv.text.replace(/^\uFEFF/, '');
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe('Course code,Course,Academic session,Registration status,Registrations');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(text).not.toContain(fixture.studentName);
    const viewer = byRole.get('VIEWER');
    if (viewer && !ROLE_PERMISSIONS.VIEWER.includes(PERMISSIONS.registrationsRead)) {
      expect((await viewer.get(path)).status).toBe(403);
    }
  });
});

describe('dashboard workload', () => {
  it('returns each queue only with its read permission, and real enrolment counts', async () => {
    const before = await testDb().studentProfileChangeRequest.count({
      where: { status: 'PENDING' },
    });
    const full = (await admin.get(`dashboard?academicSessionId=${fixture.sessionId}`).expect(200))
      .body as {
      workload: Record<string, number | null>;
      enrolment: { byProgram: { id: string; activeRegistrations: number }[] } | null;
    };
    const after = await testDb().studentProfileChangeRequest.count({
      where: { status: 'PENDING' },
    });
    expect(full.workload.profileRequestsPending).toBeGreaterThanOrEqual(before);
    expect(full.workload.profileRequestsPending).toBeLessThanOrEqual(after);
    expect(full.enrolment?.byProgram).toEqual([
      expect.objectContaining({ id: fixture.programId, activeRegistrations: 2 }),
    ]);

    for (const [role, member] of byRole) {
      const body = (await member.get('dashboard').expect(200)).body as {
        workload: Record<string, number | null>;
        enrolment: unknown;
      };
      const has = (permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);
      expect([role, body.workload.messagesAwaitingReply === null]).toEqual([
        role,
        !has(PERMISSIONS.studentMessagesRead),
      ]);
      expect([role, body.workload.resultsUnderReview === null]).toEqual([
        role,
        !has(PERMISSIONS.resultsRead),
      ]);
      expect([role, body.enrolment === null]).toEqual([role, !has(PERMISSIONS.registrationsRead)]);
      expect(typeof body.workload.unreadNotifications).toBe('number');
    }
    expect((await admin.get('dashboard?unknown=1')).status).toBe(400);
  });
});
