import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestClient, expectDbError, uid } from '../support/db.js';

const db = createTestClient();
afterAll(() => db.$disconnect());

const POLICY = 'UNIVERSITY_COURSE_DURATION_CERTIFICATES';

async function user(name: string) {
  return db.user.create({
    data: { email: `eligibility-${name}-${randomUUID()}@example.invalid`, displayName: name },
  });
}
async function course(durationValue: number | null, durationUnit: 'MONTHS' | 'YEARS' | null) {
  return db.program.create({
    data: { code: `T-ELIG-${uid()}`, name: 'Synthetic course', durationValue, durationUnit },
  });
}
async function context(months = 18, unit: 'MONTHS' | 'YEARS' = 'MONTHS') {
  const [program, proposer, approver] = await Promise.all([
    course(months, unit),
    user('proposer'),
    user('approver'),
  ]);
  return { program, proposer, approver };
}
function proposal(
  c: Awaited<ReturnType<typeof context>>,
  overrides: Partial<{
    revision: number;
    certificateTypes: string[];
    durationMonths: number;
    tier: string;
    policyVersion: number;
    status: string;
    version: number;
  }> = {},
) {
  return db.programCertificateEligibility.create({
    data: {
      programId: c.program.id,
      revision: 1,
      certificateTypes: ['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER'],
      policyId: POLICY,
      policyVersion: 1,
      durationMonths: 18,
      tier: 'MORE_THAN_ONE_YEAR',
      authorityReference: 'Synthetic authority',
      proposedByUserId: c.proposer.id,
      ...overrides,
    },
  });
}
const decide = (
  id: string,
  version: number,
  status: string,
  decidedByUserId: string,
  note?: string,
) =>
  db.programCertificateEligibility.update({
    where: { id },
    data: {
      status,
      version: version + 1,
      decidedByUserId,
      decidedAt: new Date(),
      ...(note ? { decisionNote: note } : {}),
    },
  });

describe('policy v1 is re-checked by the database', () => {
  it('rejects types outside the duration tier, including Migration for exactly 24 months', async () => {
    const c = await context(24);
    await expectDbError(
      proposal(c, { durationMonths: 24, certificateTypes: ['TRANSCRIPT', 'MIGRATION'] }),
      /policy_v1_check/,
    );
    await expectDbError(
      proposal(c, { durationMonths: 24, certificateTypes: ['COURSE_COMPLETION'] }),
      /policy_v1_check/,
    );
    await expect(proposal(c, { durationMonths: 24 })).resolves.toMatchObject({
      status: 'PROPOSED',
    });
  });

  it('rejects unresolved durations and mislabelled tiers', async () => {
    for (const months of [1, 4, 5, 7, 11, 12]) {
      const c = await context(months);
      await expectDbError(
        proposal(c, {
          durationMonths: months,
          tier: 'SHORT_COURSE',
          certificateTypes: ['COURSE_COMPLETION'],
        }),
        /policy_v1_check/,
      );
    }
    const c = await context(36);
    await expectDbError(proposal(c, { durationMonths: 36 }), /policy_v1_check/);
    await expectDbError(
      proposal(c, { durationMonths: 36, tier: 'MORE_THAN_TWO_YEARS', policyVersion: 2 }),
      /policy_v1_check/,
    );
  });

  it('rejects proposals that do not match the course duration on record', async () => {
    const c = await context(3, 'YEARS');
    await expectDbError(
      proposal(c, { durationMonths: 18 }),
      /Proposal does not match the course duration/,
    );
    const missing = { ...c, program: await course(null, null) };
    await expectDbError(proposal(missing), /Proposal does not match the course duration/);
    await expect(
      proposal(c, {
        durationMonths: 36,
        tier: 'MORE_THAN_TWO_YEARS',
        certificateTypes: ['MIGRATION'],
      }),
    ).resolves.toBeTruthy();
  });

  it('rejects empty, duplicate, unknown and training certificate types', async () => {
    const c = await context(6);
    const base = { durationMonths: 6, tier: 'SHORT_COURSE' };
    await expectDbError(proposal(c, { ...base, certificateTypes: [] }), /types_check/);
    await expectDbError(
      proposal(c, { ...base, certificateTypes: ['TRAINING_CERTIFICATE'] }),
      /types_check|policy_v1_check/,
    );
    await expectDbError(
      proposal(c, { ...base, certificateTypes: ['COURSE_COMPLETION', 'COURSE_COMPLETION'] }),
      /Duplicate certificate types/,
    );
  });
});

describe('lifecycle and separation of duties', () => {
  it('must start as a proposal', async () => {
    const c = await context();
    await expectDbError(
      proposal(c, { status: 'APPROVED' }),
      /must start as a proposal|decider_check|decision_check/,
    );
  });

  it('never lets the proposer approve or reject their own proposal', async () => {
    const c = await context();
    const p = await proposal(c);
    await expectDbError(decide(p.id, p.version, 'APPROVED', c.proposer.id), /decider_check/);
    await expectDbError(decide(p.id, p.version, 'REJECTED', c.proposer.id, 'No'), /decider_check/);
    await expect(decide(p.id, p.version, 'WITHDRAWN', c.proposer.id)).resolves.toMatchObject({
      status: 'WITHDRAWN',
    });
  });

  it('requires a rejection note and blocks reopening terminal states', async () => {
    const c = await context();
    const p = await proposal(c);
    await expectDbError(decide(p.id, p.version, 'REJECTED', c.approver.id), /rejection_note_check/);
    const rejected = await decide(p.id, p.version, 'REJECTED', c.approver.id, 'Wrong authority');
    await expectDbError(
      decide(p.id, rejected.version, 'APPROVED', c.approver.id),
      /Invalid course certificate set transition/,
    );
  });

  it('keeps one proposal and one approval per course, superseding the previous approval', async () => {
    const c = await context();
    const first = await proposal(c);
    await expectDbError(proposal(c, { revision: 2 }), /one_proposed_key|Unique constraint/);
    const approved = await decide(first.id, first.version, 'APPROVED', c.approver.id);
    const second = await proposal(c, { revision: 2, certificateTypes: ['TRANSCRIPT'] });
    await expectDbError(
      decide(second.id, second.version, 'APPROVED', c.approver.id),
      /one_approved_key|Unique constraint/,
    );
    await db.$transaction([
      db.programCertificateEligibility.update({
        where: { id: approved.id },
        data: { status: 'SUPERSEDED', version: approved.version + 1, supersededAt: new Date() },
      }),
      db.programCertificateEligibility.update({
        where: { id: second.id },
        data: {
          status: 'APPROVED',
          version: second.version + 1,
          decidedByUserId: c.approver.id,
          decidedAt: new Date(),
        },
      }),
    ]);
    const rows = await db.programCertificateEligibility.findMany({
      where: { programId: c.program.id },
      orderBy: { revision: 'asc' },
    });
    expect(rows.map((r) => r.status)).toEqual(['SUPERSEDED', 'APPROVED']);
    expect(rows[0]?.decidedByUserId).toBe(c.approver.id);
  });

  it('refuses approval after the course duration changed', async () => {
    const c = await context(18);
    const p = await proposal(c);
    await db.program.update({
      where: { id: c.program.id },
      data: { durationValue: 3, durationUnit: 'YEARS' },
    });
    await expectDbError(
      decide(p.id, p.version, 'APPROVED', c.approver.id),
      /Course duration changed/,
    );
  });

  it('keeps the proposal snapshot and approval record immutable, and history undeletable', async () => {
    const c = await context();
    const p = await proposal(c);
    await expectDbError(
      db.programCertificateEligibility.update({
        where: { id: p.id },
        data: { certificateTypes: ['TRANSCRIPT'], version: p.version + 1 },
      }),
      /snapshot is immutable/,
    );
    await expectDbError(
      db.programCertificateEligibility.update({
        where: { id: p.id },
        data: { authorityReference: 'Changed', version: p.version + 1 },
      }),
      /snapshot is immutable/,
    );
    await expectDbError(
      db.programCertificateEligibility.delete({ where: { id: p.id } }),
      /must be retained/,
    );
    await expectDbError(
      db.$executeRawUnsafe('TRUNCATE program_certificate_eligibility'),
      /must be retained/,
    );
    const approved = await decide(p.id, p.version, 'APPROVED', c.approver.id);
    const other = await user('other');
    await expectDbError(
      db.programCertificateEligibility.update({
        where: { id: p.id },
        data: {
          status: 'SUPERSEDED',
          version: approved.version + 1,
          supersededAt: new Date(),
          decidedByUserId: other.id,
        },
      }),
      /Approval record is immutable/,
    );
  });

  it('does not let a program be deleted while it has eligibility history', async () => {
    const c = await context();
    await proposal(c);
    await expectDbError(
      db.program.delete({ where: { id: c.program.id } }),
      /Foreign key|foreign key|P2003|23001|RESTRICT|restrict/,
    );
  });
});
