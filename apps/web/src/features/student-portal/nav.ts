import {
  BellIcon,
  BookOpenIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  SettingsIcon,
  UserRoundIcon,
} from 'lucide-react';

export type StudentNavHref =
  | '/student'
  | '/student/profile'
  | '/student/course'
  | '/student/examinations'
  | '/student/results'
  | '/student/documents'
  | '/student/notifications'
  | '/student/settings';

/** Student portal pages that are not sidebar entries (reached from their parent page). */
export type StudentSubpageHref =
  | '/student/profile/requests'
  | '/student/examinations/re-exam'
  | '/student/examinations/re-exam/applications';

export interface StudentNavItem {
  href: StudentNavHref;
  label: string;
  icon: LucideIcon;
  /** Planned modules are reachable (they explain their status) but marked "Soon" — never faked. */
  available: boolean;
}

export const STUDENT_NAV: readonly StudentNavItem[] = [
  { href: '/student', label: 'Dashboard', icon: LayoutDashboardIcon, available: true },
  { href: '/student/profile', label: 'My Profile', icon: UserRoundIcon, available: true },
  { href: '/student/course', label: 'Course Details', icon: BookOpenIcon, available: true },
  {
    href: '/student/examinations',
    label: 'Examinations',
    icon: ClipboardCheckIcon,
    available: true,
  },
  { href: '/student/results', label: 'Results', icon: ClipboardListIcon, available: false },
  { href: '/student/documents', label: 'My Documents', icon: FileTextIcon, available: true },
  { href: '/student/notifications', label: 'Notifications', icon: BellIcon, available: false },
  { href: '/student/settings', label: 'Account Settings', icon: SettingsIcon, available: true },
];

export function isStudentNavActive(pathname: string, href: string): boolean {
  return href === '/student'
    ? pathname === '/student'
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** The registration shown first: the most recently created one (the API returns newest first). */
export function primaryRegistration<T>(registrations: readonly T[]): T | undefined {
  return registrations[0];
}
