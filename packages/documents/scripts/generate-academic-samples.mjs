// Regenerates the fixed student academic sample PDFs (Phase 12C.1) from the approved Phase 12C
// templates and their standard synthetic records. Run deliberately, never during requests:
//
//   pnpm --filter @docversity/documents build
//   node packages/documents/scripts/generate-academic-samples.mjs
//
// Then review the PDFs, update the pins in src/academic-certificate-samples.ts with the printed
// SHA-256 and sizes, and run the documents tests (including the drift check).
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  academicCertificateTemplate,
  renderAcademicCertificatePreview,
  syntheticAcademicCertificate,
} from '../dist/index.js';

const SAMPLES = {
  COURSE_COMPLETION: 'sample-course-completion-v1',
  TRANSCRIPT: 'sample-transcript-v1',
  PROVISIONAL: 'sample-provisional-v1',
  CHARACTER: 'sample-character-v1',
  MIGRATION: 'sample-migration-v1',
};

const dir = fileURLToPath(new URL('../assets/samples/academic/', import.meta.url));
mkdirSync(dir, { recursive: true });
for (const [type, id] of Object.entries(SAMPLES)) {
  const rendered = await renderAcademicCertificatePreview(
    syntheticAcademicCertificate(type, 'standard'),
    academicCertificateTemplate(type, 1),
  );
  const bytes = Buffer.from(rendered.bytes);
  writeFileSync(`${dir}${id}.pdf`, bytes);
  console.log(
    `${type} ${id} pages=${rendered.pages} bytes=${bytes.length} sha256=${createHash('sha256').update(bytes).digest('hex')}`,
  );
}
