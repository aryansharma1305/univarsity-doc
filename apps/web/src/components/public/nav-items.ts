/** Landing page sections (anchors work from any public page). */
export const PUBLIC_SECTIONS = [
  { href: '/#features', label: 'Features', available: true },
  { href: '/#get-started', label: 'Get started', available: true },
  { href: '/#roadmap', label: 'What’s coming', available: true },
  { href: '/#faq', label: 'FAQ', available: true },
] as const;

export const PUBLIC_NAV = [
  { href: '/', label: 'Home', available: true },
  { href: '/results', label: 'Results', available: false },
  { href: '/verify/registration', label: 'Registration Verification', available: false },
  { href: '/verify/certificate', label: 'Certificate Verification', available: false },
  { href: '/verify/qr', label: 'Scan QR', available: false },
  { href: '/help', label: 'Help', available: true },
] as const;

export const PUBLIC_ACCESS = [
  { href: '/student/login', label: 'Student Login', available: true },
  { href: '/student/register', label: 'Activate Student Account', available: true },
  { href: '/admin/login', label: 'Staff Login', available: true },
] as const;
