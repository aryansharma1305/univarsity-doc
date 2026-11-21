import {
  BellIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FileTextIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  MessagesSquareIcon,
  type LucideIcon,
  SettingsIcon,
  UserRoundIcon,
} from 'lucide-react';
import type { Route } from 'next';

export type StudentNavHref =
  | '/student'
  | '/student/profile'
  | '/student/requests'
  | '/student/messages'
  | '/student/verification-queries'
  | '/student/examinations'
  | '/student/results'
  | '/student/certificate-requests'
  | '/student/documents'
  | '/student/notifications'
  | '/student/settings';

/** Student portal pages that are not sidebar entries (reached from their parent page). */
export type StudentSubpageHref =
  | '/student/profile/requests'
  | '/student/profile/update'
  | '/student/examinations/apply'
  | '/student/examinations/re-exam'
  | '/student/examinations/re-exam/applications';

export interface StudentNavItem {
  href: StudentNavHref;
  label: string;
  icon: LucideIcon;
  /** Planned modules are reachable (they explain their status) but marked "Soon" — never faked. */
  available: boolean;
  /** Sub-pages listed under the section in the sidebar and drawer (not in the mobile quick bar). */
  children?: readonly { href: Route; label: string }[];
}

export const STUDENT_NAV: readonly StudentNavItem[] = [
  { href: '/student', label: 'Dashboard', icon: LayoutDashboardIcon, available: true },
  {
    href: '/student/profile',
    label: 'My Profile',
    icon: UserRoundIcon,
    available: true,
    children: [
      { href: '/student/profile#course-details', label: 'Course Details' },
      { href: '/student/profile/update', label: 'Update My Details' },
    ],
  },
  { href: '/student/requests', label: 'My Requests', icon: HistoryIcon, available: true },
  { href: '/student/messages', label: 'Messages', icon: MessagesSquareIcon, available: true },
  {
    href: '/student/examinations',
    label: 'Examinations',
    icon: ClipboardCheckIcon,
    available: true,
    children: [
      { href: '/student/examinations/apply', label: 'Apply for Exam' },
      { href: '/student/examinations/re-exam', label: 'Apply for Re-exam' },
      { href: '/student/examinations#exam-panel', label: 'Login to Exam Panel' },
    ],
  },
  {
    href: '/student/results',
    label: 'Results',
    icon: ClipboardListIcon,
    available: true,
    children: [{ href: '/student/results', label: 'View Result' }],
  },
  {
    href: '/student/certificate-requests',
    label: 'Certificate Requests',
    icon: FileTextIcon,
    available: true,
  },
  { href: '/student/documents', label: 'My Documents', icon: FileTextIcon, available: true },
  {
    href: '/student/verification-queries',
    label: 'Verification Queries',
    icon: LifeBuoyIcon,
    available: true,
  },
  { href: '/student/notifications', label: 'Notifications', icon: BellIcon, available: true },
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
