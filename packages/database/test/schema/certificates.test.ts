import { afterAll, describe, expect, it } from 'vitest';
import { createTestClient, expectDbError, uid } from '../support/db.js';
import { fixtures, token } from '../support/fixtures.js';

const db = createTestClient();
const f = fixtures(db);
afterAll(() => db.$disconnect());

describe('certificate lifecycle', () => {
  it('cannot be ISSUED without number, token, issue date and issued-at', async () => {
    const reg = await f.registration();
    await expectDbError(
      db.certificate.create({
        data: {
          studentRegistrationId: reg.id,
          programId: reg.programId,
          documentType: 'PROVISIONAL',
          status: 'ISSUED',
        },
      }),
      /certificates_lifecycle_check/,
    );
  });

  it("requires the certificate's program to be the registration's program", async () => {
    const reg = await f.registration();
    const otherProgram = await f.program();
    await expectDbError(
      db.certificate.create({
        data: {
          studentRegistrationId: reg.id,
          programId: otherProgram.id,
          documentType: 'PROVISIONAL',
        },
      }),
      /P2003[\s\S]*certificates_student_registration_id_program_id_fkey/,
    );
  });

  it('requires the template to match the document type', async () => {
    const reg = await f.registration();
    const transcriptTemplate = await f.template('TRANSCRIPT');
    await expectDbError(
      db.certificate.create({
        data: {
          studentRegistrationId: reg.id,
          programId: reg.programId,
          documentType: 'PROVISIONAL',
          certificateTemplateId: transcriptTemplate.id,
        },
      }),
      /DV001[\s\S]*certificates_guard: template .* is not a PROVISIONAL template/,
    );
  });

  it('lets drafts be edited and deleted', async () => {
    const reg = await f.registration();
    const draft = await db.certificate.create({
      data: { studentRegistrationId: reg.id, programId: reg.programId, documentType: 'CHARACTER' },
    });
    await db.certificate.update({
      where: { id: draft.id },
      data: { sourceSnapshot: { edited: true } },
    });
    await db.certificate.delete({ where: { id: draft.id } });
  });

  it('cancels (not deletes) certificates that left draft, and requires a reason', async () => {
    const reg = await f.registration();
    const pending = await db.certificate.create({
      data: {
        studentRegistrationId: reg.id,
        programId: reg.programId,
        documentType: 'CHARACTER',
        status: 'PENDING_APPROVAL',
      },
    });
    await expectDbError(
      db.certificate.delete({ where: { id: pending.id } }),
      /certificates_guard: only DRAFT/,
    );
    await expectDbError(
      db.certificate.update({
        where: { id: pending.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      }),
      /certificates_lifecycle_check/,
    );
    await db.certificate.update({
      where: { id: pending.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: 'Requested in error',
      },
    });
    await expectDbError(
      db.certificate.update({ where: { id: pending.id }, data: { status: 'DRAFT' } }),
      /certificates_guard: CANCELLED certificate .* is immutable/,
    );
  });
});

describe('issued certificates are immutable', () => {
  it('rejects edits to an issued certificate', async () => {
    const { certificate } = await f.issuedCertificate();
    await expectDbError(
      db.certificate.update({
        where: { id: certificate.id },
        data: { sourceSnapshot: { tampered: true } },
      }),
      /certificates_guard: issued certificate .* cannot be edited/,
    );
    await expectDbError(
      db.certificate.update({ where: { id: certificate.id }, data: { pdfHash: 'f'.repeat(64) } }),
      /certificates_guard/,
    );
  });

  it('never changes an assigned number or token', async () => {
    const { certificate } = await f.issuedCertificate();
    await expectDbError(
      db.certificate.update({
        where: { id: certificate.id },
        data: { certificateNumber: `T-CERT-${uid()}` },
      }),
      /certificates_guard: certificate number .* cannot change/,
    );
    await expectDbError(
      db.certificate.update({
        where: { id: certificate.id },
        data: { verificationToken: token() },
      }),
      /certificates_guard: verification token .* cannot change/,
    );
  });

  it('rejects deleting an issued certificate', async () => {
    const { certificate } = await f.issuedCertificate();
    await expectDbError(
      db.certificate.delete({ where: { id: certificate.id } }),
      /certificates_guard: only DRAFT/,
    );
  });

  it('can be revoked only with a reason, and is frozen afterwards', async () => {
    const { certificate } = await f.issuedCertificate();
    await expectDbError(
      db.certificate.update({
        where: { id: certificate.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
      /certificates_lifecycle_check/,
    );
    const revoked = await db.certificate.update({
      where: { id: certificate.id },
      data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: 'Issued in error' },
    });
    expect(revoked.certificateNumber).toBe(certificate.certificateNumber);
    await expectDbError(
      db.certificate.update({
        where: { id: certificate.id },
        data: { revocationReason: 'Changed' },
      }),
      /certificates_guard: REVOKED certificate .* is immutable/,
    );
  });

  it('cannot go from ISSUED back to DRAFT or to CANCELLED', async () => {
    const { certificate } = await f.issuedCertificate();
    for (const status of ['DRAFT', 'CANCELLED'] as const) {
      await expectDbError(
        db.certificate.update({ where: { id: certificate.id }, data: { status } }),
        /certificates_guard: invalid status transition ISSUED/,
      );
    }
  });
});

describe('certificate supersession', () => {
  it('replaces an issued certificate with a new one of the same registration and type', async () => {
    const { certificate: original, registration } = await f.issuedCertificate();
    const replacement = await db.certificate.create({
      data: {
        studentRegistrationId: registration.id,
        programId: registration.programId,
        documentType: original.documentType,
        supersedesCertificateId: original.id,
      },
    });
    await db.certificate.update({ where: { id: original.id }, data: { status: 'SUPERSEDED' } });

    const chain = await db.certificate.findUniqueOrThrow({
      where: { id: replacement.id },
      include: { supersedes: true },
    });
    expect(chain.supersedes?.status).toBe('SUPERSEDED');
    // The superseded record is still the one its number/QR resolves to — it is never deleted.
    expect(
      await db.certificate.findUnique({
        where: { certificateNumber: original.certificateNumber ?? '' },
      }),
    ).not.toBeNull();
    await expectDbError(
      db.certificate.update({ where: { id: original.id }, data: { status: 'ISSUED' } }),
      /certificates_guard: SUPERSEDED certificate .* is immutable/,
    );
  });

  it('rejects a replacement for a different document type or registration', async () => {
    const { certificate: original, registration } = await f.issuedCertificate({
      documentType: 'PROVISIONAL',
    });
    await expectDbError(
      db.certificate.create({
        data: {
          studentRegistrationId: registration.id,
          programId: registration.programId,
          documentType: 'TRANSCRIPT',
          supersedesCertificateId: original.id,
        },
      }),
      /certificates_guard: a replacement must supersede/,
    );
    const stranger = await f.registration();
    await expectDbError(
      db.certificate.create({
        data: {
          studentRegistrationId: stranger.id,
          programId: stranger.programId,
          documentType: 'PROVISIONAL',
          supersedesCertificateId: original.id,
        },
      }),
      /certificates_guard: a replacement must supersede/,
    );
  });

  it('allows only one replacement per certificate', async () => {
    const { certificate: original, registration } = await f.issuedCertificate();
    const data = {
      studentRegistrationId: registration.id,
      programId: registration.programId,
      documentType: original.documentType,
      supersedesCertificateId: original.id,
    };
    await db.certificate.create({ data });
    await expectDbError(
      db.certificate.create({ data }),
      /P2002[\s\S]*certificates_supersedes_certificate_id_key/,
    );
  });

  it('cannot mark a certificate SUPERSEDED before its replacement exists', async () => {
    const { certificate } = await f.issuedCertificate();
    await expectDbError(
      db.certificate.update({ where: { id: certificate.id }, data: { status: 'SUPERSEDED' } }),
      /certificates_guard: certificate .* has no replacement/,
    );
  });

  it('cannot supersede a certificate that was never issued', async () => {
    const reg = await f.registration();
    const draft = await db.certificate.create({
      data: {
        studentRegistrationId: reg.id,
        programId: reg.programId,
        documentType: 'PROVISIONAL',
      },
    });
    await expectDbError(
      db.certificate.create({
        data: {
          studentRegistrationId: reg.id,
          programId: reg.programId,
          documentType: 'PROVISIONAL',
          supersedesCertificateId: draft.id,
        },
      }),
      /certificates_guard: only an issued or revoked certificate can be superseded/,
    );
  });
});
