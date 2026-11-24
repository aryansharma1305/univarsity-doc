import { describe, expect, it } from 'vitest';
import { renderAdmissionLetter } from '../src/admission-letter.js';

const input = {
  institutionName: 'Synthetic Test Institute',
  letterNumber: 'TEST/AL/2026/0001',
  issueDate: '2026-11-23',
  authorityReference: 'TEST-AUTH-REF-001',
  studentName: 'Test Student Example',
  nationality: 'Testland',
  registrationNumber: 'TEST-REG-0001',
  courseName: 'Certificate in Synthetic Studies',
  courseLevel: 'Training Program',
  courseDuration: '6 months',
  school: 'Department of Synthetic Testing',
  academicSession: 'TEST-SESSION 2026',
  admissionDate: '2026-07-01',
  templateName: 'Synthetic Admission Letter',
  templateVersion: 1,
  verifyUrl: 'https://verify.example.test/verify/admission-letter',
};
const pages = (bytes: Buffer) => bytes.toString('latin1').match(/\/Type \/Page[^s]/g)?.length;

describe('admission letter', () => {
  it('renders one deterministic A4 page from validated values', async () => {
    const first = await renderAdmissionLetter(input);
    expect(first.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(first)).toBe(1);
    // Same input, same bytes: the stored hash pins exactly what was previewed.
    expect(Buffer.compare(first, await renderAdmissionLetter(input))).toBe(0);
    // Optional course details may be absent; the letter still fits one page.
    const sparse = await renderAdmissionLetter({
      ...input,
      courseLevel: null,
      courseDuration: null,
      school: null,
      admissionDate: null,
    });
    expect(pages(sparse)).toBe(1);
  });

  it('refuses missing or unsafe values instead of printing them', async () => {
    await expect(renderAdmissionLetter({ ...input, nationality: '' })).rejects.toThrow();
    await expect(renderAdmissionLetter({ ...input, studentName: 'A\u0007B' })).rejects.toThrow();
    await expect(renderAdmissionLetter({ ...input, signature: 'x' })).rejects.toThrow();
    await expect(
      renderAdmissionLetter({ ...input, verifyUrl: 'javascript:alert(1)' }),
    ).rejects.toThrow();
  });
});
