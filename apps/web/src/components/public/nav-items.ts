/** The five public header destinations, shared by desktop and mobile navigation. */
export const PUBLIC_HEADER_NAV = [
  { href: '/verify/admission-letter', label: 'Verify Admission Letter' },
  { href: '/verify/certificate', label: 'Verify Certificate' },
  { href: '/verify/registration', label: 'Verify Registration' },
  { href: '/results', label: 'Check Result' },
  { href: '/student/login', label: 'Student Sign in' },
] as const;

/** Existing public pages link back to the verification homepage. */
export const PUBLIC_SECTIONS = [
  { href: '/', label: 'Home', available: true },
  { href: '/contact', label: 'Contact', available: true },
] as const;

export const PUBLIC_NAV = [
  { href: '/', label: 'Home', available: true },
  { href: '/results', label: 'Results', available: true },
  { href: '/verify/registration', label: 'Registration Verification', available: true },
  { href: '/verify/certificate', label: 'Certificate Verification', available: true },
  { href: '/verify/qr', label: 'Scan QR', available: true },
  { href: '/help', label: 'Help', available: true },
] as const;

export const PUBLIC_ACCESS = [
  { href: '/student/login', label: 'Student Login', available: true },
  { href: '/student/register', label: 'Activate Student Account', available: true },
  { href: '/admin/login', label: 'Staff Login', available: true },
] as const;
