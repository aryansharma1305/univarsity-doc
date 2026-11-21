import type { PublicVerificationService } from '@docversity/validation';

/** Titles, labels and placeholders shared by the service pages and the homepage search. */
export const SERVICES = {
  'admission-letter': {
    title: 'Verify Admission Letter',
    label: 'Admission letter number',
    placeholder: 'Enter admission letter number',
  },
  certificate: {
    title: 'Verify Certificate',
    label: 'Certificate number',
    placeholder: 'Enter the code printed on the certificate',
  },
  registration: {
    title: 'Verify Registration',
    label: 'Registration number',
    placeholder: 'Enter registration number',
  },
  result: {
    title: 'Check Result',
    label: 'Registration number',
    placeholder: 'Enter your registration number',
  },
} satisfies Record<
  PublicVerificationService,
  { title: string; label: string; placeholder: string }
>;
