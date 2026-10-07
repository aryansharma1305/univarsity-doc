import { afterAll, describe, expect, it } from 'vitest';
import { createTestClient, expectDbError, uid } from '../support/db.js';
import { fixtures } from '../support/fixtures.js';

const db = createTestClient();
const f = fixtures(db);
afterAll(() => db.$disconnect());

describe('program document template mapping', () => {
  it('allows one default template per program and document type', async () => {
    const program = await f.program();
    const a = await f.template('PROVISIONAL');
    const b = await f.template('PROVISIONAL');
    await db.programDocumentTemplate.create({
      data: {
        programId: program.id,
        documentType: 'PROVISIONAL',
        certificateTemplateId: a.id,
        isDefault: true,
      },
    });
    await expectDbError(
      db.programDocumentTemplate.create({
        data: {
          programId: program.id,
          documentType: 'PROVISIONAL',
          certificateTemplateId: b.id,
          isDefault: true,
        },
      }),
      /P2002[\s\S]*program_document_templates_one_default_key/,
    );
    // A different document type for the same program has its own default.
    const transcript = await f.template('TRANSCRIPT');
    await db.programDocumentTemplate.create({
      data: {
        programId: program.id,
        documentType: 'TRANSCRIPT',
        certificateTemplateId: transcript.id,
        isDefault: true,
      },
    });
  });

  it('requires defaults to be undated and overrides to be dated', async () => {
    const program = await f.program();
    const tpl = await f.template('PROVISIONAL');
    const base = {
      programId: program.id,
      documentType: 'PROVISIONAL',
      certificateTemplateId: tpl.id,
    } as const;
    await expectDbError(
      db.programDocumentTemplate.create({
        data: { ...base, isDefault: true, effectiveFrom: new Date('2026-01-01') },
      }),
      /program_document_templates_dates_check/,
    );
    await expectDbError(
      db.programDocumentTemplate.create({ data: { ...base, isDefault: false } }),
      /program_document_templates_dates_check/,
    );
  });

  it('rejects overlapping dated mappings for the same program and document type', async () => {
    const program = await f.program();
    const tpl = await f.template('CHARACTER');
    const base = {
      programId: program.id,
      documentType: 'CHARACTER',
      certificateTemplateId: tpl.id,
    } as const;
    await db.programDocumentTemplate.create({
      data: { ...base, effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-06-30') },
    });
    // Adjacent, non-overlapping range is fine.
    await db.programDocumentTemplate.create({
      data: { ...base, effectiveFrom: new Date('2026-07-01'), effectiveTo: new Date('2026-12-31') },
    });
    await expectDbError(
      db.programDocumentTemplate.create({
        data: { ...base, effectiveFrom: new Date('2026-06-30') },
      }),
      /DV001[\s\S]*program_document_templates_guard: effective dates overlap/,
    );
  });

  it('rejects mapping a template to a different document type', async () => {
    const program = await f.program();
    const transcriptTemplate = await f.template('TRANSCRIPT');
    await expectDbError(
      db.programDocumentTemplate.create({
        data: {
          programId: program.id,
          documentType: 'PROVISIONAL',
          certificateTemplateId: transcriptTemplate.id,
          isDefault: true,
        },
      }),
      /P2003[\s\S]*program_document_templates_certificate_template_id_documen_fkey/,
    );
  });
});

describe('versioned templates', () => {
  it('can edit a DRAFT template but freezes it once ACTIVE (only archiving remains)', async () => {
    const tpl = await f.template('PROVISIONAL');
    await db.certificateTemplate.update({
      where: { id: tpl.id },
      data: { templateMarkup: '<p>draft</p>' },
    });
    await db.certificateTemplate.update({ where: { id: tpl.id }, data: { status: 'ACTIVE' } });
    await expectDbError(
      db.certificateTemplate.update({
        where: { id: tpl.id },
        data: { templateMarkup: '<p>changed</p>' },
      }),
      /certificate_templates_guard: template .* cannot be edited; create a new version/,
    );
    await expectDbError(
      db.certificateTemplate.update({ where: { id: tpl.id }, data: { status: 'DRAFT' } }),
      /certificate_templates_guard: invalid status transition ACTIVE -> DRAFT/,
    );
    await expectDbError(
      db.certificateTemplate.delete({ where: { id: tpl.id } }),
      /certificate_templates_guard/,
    );
    const archived = await db.certificateTemplate.update({
      where: { id: tpl.id },
      data: { status: 'ARCHIVED' },
    });
    expect(archived.templateMarkup).toBe('<p>draft</p>');
  });

  it('versions templates by (name, version)', async () => {
    const name = `T-TPL-${uid()}`;
    await db.certificateTemplate.create({ data: { name, version: 1, documentType: 'TRANSCRIPT' } });
    await db.certificateTemplate.create({ data: { name, version: 2, documentType: 'TRANSCRIPT' } });
    await expectDbError(
      db.certificateTemplate.create({ data: { name, version: 2, documentType: 'TRANSCRIPT' } }),
      /P2002[\s\S]*certificate_templates_name_version_key/,
    );
  });
});

describe('grading schemes are data and versioned', () => {
  it('stores rules as a JSON object only', async () => {
    await expectDbError(
      db.gradingScheme.create({
        data: { name: `T-GS-${uid()}`, version: 1, rules: ['not', 'an', 'object'] },
      }),
      /grading_schemes_values_check/,
    );
  });

  it('freezes rules once ACTIVE but allows closing the validity period', async () => {
    const scheme = await db.gradingScheme.create({
      data: { name: `T-GS-${uid()}`, version: 1, rules: { placeholder: true }, status: 'ACTIVE' },
    });
    await expectDbError(
      db.gradingScheme.update({
        where: { id: scheme.id },
        data: { rules: { placeholder: false } },
      }),
      /grading_schemes_guard: .* cannot be edited; create a new version/,
    );
    await db.gradingScheme.update({
      where: { id: scheme.id },
      data: { effectiveTo: new Date('2027-01-01') },
    });
    await expectDbError(
      db.gradingScheme.delete({ where: { id: scheme.id } }),
      /grading_schemes_guard/,
    );
  });

  it('lets a result reference the exact scheme version and keep a calculation snapshot', async () => {
    const scheme = await db.gradingScheme.create({
      data: { name: `T-GS-${uid()}`, version: 3, rules: { placeholder: true }, status: 'ACTIVE' },
    });
    const { registration, examination } = await f.examContext();
    const result = await db.result.create({
      data: {
        studentRegistrationId: registration.id,
        examinationId: examination.id,
        gradingSchemeId: scheme.id,
        calculationSnapshot: { schemeVersion: 3, inputs: [], note: 'test' },
      },
      include: { gradingScheme: true },
    });
    expect(result.gradingScheme?.version).toBe(3);
  });
});
