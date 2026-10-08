export const PUBLIC_NAV = [
  { href: '/', label: 'Home', available: true },
  { href: '/results', label: 'Results', available: false },
  { href: '/verify/registration', label: 'Registration Verification', available: false },
  { href: '/verify/certificate', label: 'Certificate Verification', available: false },
  { href: '/help', label: 'Help', available: true },
] as const;

export const PUBLIC_ACCESS = [
  { href: '/student/login', label: 'Student Login', available: true },
  { href: '/student/register', label: 'Activate Student Account', available: true },
  { href: '/admin/login', label: 'Staff Login', available: true },
] as const;
