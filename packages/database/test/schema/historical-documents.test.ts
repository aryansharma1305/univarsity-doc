import { afterAll, describe, expect, it } from 'vitest';
import { createTestClient, expectDbError, uid } from '../support/db.js';
import { fixtures } from '../support/fixtures.js';

const db = createTestClient();
const f = fixtures(db);
afterAll(() => db.$disconnect());

async function staffUser() {
  return db.user.create({
    data: { email: `doc-${uid().toLowerCase()}@example.test`, displayName: 'Test Staff' },
  });
}

const sha = () =>
  uid()
    .toLowerCase()
    .padEnd(64, '0')
    .replace(/[^0-9a-f]/g, 'a');

async function draft(options: { registrationId?: string; replaces?: string } = {}) {
  const registrationId = options.registrationId ?? (await f.registration()).id;
  const uploader = await staffUser();
  const doc = await db.historicalDocument.create({
    data: {
      studentRegistrationId: registrationId,
      documentType: 'DEGREE_CERTIFICATE',
      title: 'Synthetic certificate',
      provenance: 'UNIVERSITY_ARCHIVE',
      storageKey: `documents/${registrationId}/${uid()}.pdf`,
      contentType: 'application/pdf',
      sizeBytes: 100,
      sha256: sha(),
      originalFilename: 'scan.pdf',
      uploadedByUserId: uploader.id,
      replacesDocumentId: options.replaces ?? null,
    },
  });
  return { doc, uploader, registrationId };
}

const publish = (id: string, userId: string) =>
  db.historicalDocument.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: new Date(), publishedByUserId: userId },
  });

describe('historical documents (historical_documents_guard)', () => {
  it('creates documents only as drafts and never deletes them', async () => {
    const { doc, uploader } = await draft();
    await expectDbError(
      db.historicalDocument.delete({ where: { id: doc.id } }),
      /cannot be deleted/,
    );
    await expectDbError(
      db.historicalDocument.create({
        data: {
          studentRegistrationId: doc.studentRegistrationId,
          documentType: 'MARKSHEET',
          title: 'x',
          provenance: 'OTHER',
          storageKey: 'documents/x.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1,
          sha256: sha(),
          originalFilename: 'x.pdf',
          uploadedByUserId: uploader.id,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedByUserId: uploader.id,
        },
      }),
      /created as DRAFT/,
    );
  });

  it('keeps the file and owner immutable and freezes metadata once published', async () => {
    const { doc, uploader } = await draft();
    await db.historicalDocument.update({
      where: { id: doc.id },
      data: { title: 'Corrected title' },
    });
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: { storageKey: 'documents/other.pdf' },
      }),
      /immutable/,
    );
    const other = await f.registration();
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: { studentRegistrationId: other.id },
      }),
      /immutable/,
    );
    await publish(doc.id, uploader.id);
    await expectDbError(
      db.historicalDocument.update({ where: { id: doc.id }, data: { certificateNumber: 'NEW-1' } }),
      /only change while it is a draft/,
    );
  });

  it('allows only the documented status transitions and requires a withdrawal reason', async () => {
    const { doc, uploader } = await draft();
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: { status: 'SUPERSEDED', supersededAt: new Date(), publishedAt: new Date() },
      }),
      /DRAFT → SUPERSEDED is not allowed/,
    );
    await publish(doc.id, uploader.id);
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: { status: 'WITHDRAWN', withdrawnAt: new Date(), withdrawnByUserId: uploader.id },
      }),
      /historical_documents_lifecycle_check/,
    );
    await db.historicalDocument.update({
      where: { id: doc.id },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
        withdrawnByUserId: uploader.id,
        withdrawalReason: 'Issued to the wrong registration.',
      },
    });
    await expectDbError(
      db.historicalDocument.update({ where: { id: doc.id }, data: { status: 'DRAFT' } }),
      /WITHDRAWN → DRAFT is not allowed/,
    );
    await publish(doc.id, uploader.id);
    await db.historicalDocument.update({
      where: { id: doc.id },
      data: { status: 'SUPERSEDED', supersededAt: new Date() },
    });
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: { authenticity: 'DISPUTED', authenticityReviewedAt: new Date() },
      }),
      /superseded document .* read-only/,
    );
  });

  it('keeps replacements on the same registration, one live replacement at a time', async () => {
    const { doc, registrationId } = await draft();
    await expectDbError(draft({ replaces: doc.id }), /same registration/);
    const first = await draft({ registrationId, replaces: doc.id });
    await expectDbError(draft({ registrationId, replaces: doc.id }), /one_live_replacement/);
    await db.historicalDocument.update({
      where: { id: first.doc.id },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
        withdrawnByUserId: first.uploader.id,
        withdrawalReason: 'Wrong scan uploaded.',
      },
    });
    await draft({ registrationId, replaces: doc.id });
  });

  it('separates authenticity review from upload and refuses duplicate files per registration', async () => {
    const { doc, uploader, registrationId } = await draft();
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: {
          authenticity: 'CONFIRMED_AGAINST_RECORDS',
          authenticityReviewedAt: new Date(),
          authenticityReviewedByUserId: uploader.id,
        },
      }),
      /historical_documents_authenticity_check/,
    );
    const reviewer = await staffUser();
    await db.historicalDocument.update({
      where: { id: doc.id },
      data: {
        authenticity: 'CONFIRMED_AGAINST_RECORDS',
        authenticityReviewedAt: new Date(),
        authenticityReviewedByUserId: reviewer.id,
      },
    });
    await expectDbError(
      db.historicalDocument.create({
        data: {
          studentRegistrationId: registrationId,
          documentType: 'MARKSHEET',
          title: 'Same file',
          provenance: 'OTHER',
          storageKey: `documents/${registrationId}/${uid()}.pdf`,
          contentType: 'application/pdf',
          sizeBytes: 100,
          sha256: doc.sha256,
          originalFilename: 'again.pdf',
          uploadedByUserId: uploader.id,
        },
      }),
      /one_file_per_registration/,
    );
    await expectDbError(
      db.historicalDocument.update({ where: { id: doc.id }, data: { contentType: 'text/html' } }),
      /immutable|file_check/,
    );
    expect(
      await db.historicalDocument.count({ where: { studentRegistrationId: registrationId } }),
    ).toBe(1);
  });
});

describe('Phase 8 hardening (student copies, certificate numbers)', () => {
  async function imageDraft() {
    const registrationId = (await f.registration()).id;
    const uploader = await staffUser();
    const doc = await db.historicalDocument.create({
      data: {
        studentRegistrationId: registrationId,
        documentType: 'MARKSHEET',
        title: 'Synthetic scan',
        provenance: 'UNIVERSITY_ARCHIVE',
        storageKey: `documents/${registrationId}/${uid()}.jpg`,
        contentType: 'image/jpeg',
        sizeBytes: 100,
        sha256: sha(),
        originalFilename: 'scan.jpg',
        uploadedByUserId: uploader.id,
      },
    });
    return { doc, uploader };
  }
  const copyFields = (key: string) => ({
    studentCopyStorageKey: key,
    studentCopyContentType: 'image/jpeg',
    studentCopySizeBytes: 90,
    studentCopySha256: sha(),
    studentCopyCreatedAt: new Date(),
    embeddedMetadata: ['LOCATION' as const],
  });

  it('never publishes an image without its student copy', async () => {
    const { doc, uploader } = await imageDraft();
    await expectDbError(publish(doc.id, uploader.id), /needs its metadata-free student copy/);
    await db.historicalDocument.update({
      where: { id: doc.id },
      data: copyFields(`documents/${uid()}/copy.jpg`),
    });
    await publish(doc.id, uploader.id);
  });

  it('sets the student copy once, all fields together, for images only', async () => {
    const { doc } = await imageDraft();
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: { studentCopyStorageKey: 'documents/x/copy.jpg' },
      }),
      /historical_documents_student_copy_check/,
    );
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: { ...copyFields(doc.storageKey) },
      }),
      /historical_documents_student_copy_check/,
    );
    await db.historicalDocument.update({
      where: { id: doc.id },
      data: copyFields(`documents/${uid()}/copy.jpg`),
    });
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: { studentCopySha256: sha() },
      }),
      /student copy of document .* is immutable/,
    );
    await expectDbError(
      db.historicalDocument.update({ where: { id: doc.id }, data: { embeddedMetadata: [] } }),
      /student copy of document .* is immutable/,
    );
    const { doc: pdf } = await draft();
    await expectDbError(
      db.historicalDocument.update({
        where: { id: pdf.id },
        data: { ...copyFields(`documents/${uid()}/copy.jpg`) },
      }),
      /historical_documents_student_copy_check/,
    );
  });

  it('keeps the exact number with its normalised form, frozen after publication', async () => {
    const { doc, uploader } = await draft();
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: { certificateNumber: ' LEG/1 ' },
      }),
      /historical_documents_certificate_number_check/,
    );
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: { certificateNumber: 'LEG\n1', certificateNumberNormalized: 'LEG1' },
      }),
      /historical_documents_certificate_number_check/,
    );
    await db.historicalDocument.update({
      where: { id: doc.id },
      data: { certificateNumber: ' LEG/1 ', certificateNumberNormalized: 'LEG1' },
    });
    expect(
      (await db.historicalDocument.findUniqueOrThrow({ where: { id: doc.id } })).certificateNumber,
    ).toBe(' LEG/1 ');
    await publish(doc.id, uploader.id);
    await expectDbError(
      db.historicalDocument.update({
        where: { id: doc.id },
        data: { certificateNumberNormalized: 'OTHER' },
      }),
      /can only change while it is a draft/,
    );
  });
});
