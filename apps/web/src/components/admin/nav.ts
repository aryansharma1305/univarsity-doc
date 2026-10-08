import type { Permission } from '@docversity/types';
import { PERMISSIONS } from '@docversity/types';
import {
  BuildingIcon,
  CalendarRangeIcon,
  FileSpreadsheetIcon,
  GraduationCapIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  UserRoundPenIcon,
  UsersIcon,
} from 'lucide-react';

export interface AdminNavItem {
  href:
    | '/admin'
    | '/admin/students'
    | '/admin/imports'
    | '/admin/student-accounts'
    | '/admin/profile-requests'
    | '/admin/programs'
    | '/admin/departments'
    | '/admin/academic-sessions';
  label: string;
  icon: LucideIcon;
  /** Hidden for users without this permission. */
  permission?: Permission;
}

/**
 * Admin navigation. Only features that exist are listed — results, certificates and templates are
 * omitted until they are built (no fake navigation).
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon },
  {
    href: '/admin/students',
    label: 'Students',
    icon: UsersIcon,
    permission: PERMISSIONS.studentsRead,
  },
  {
    href: '/admin/imports',
    label: 'Imports',
    icon: FileSpreadsheetIcon,
    permission: PERMISSIONS.importsRead,
  },
  {
    href: '/admin/student-accounts',
    label: 'Student Accounts',
    icon: KeyRoundIcon,
    permission: PERMISSIONS.studentAccountsRead,
  },
  {
    href: '/admin/profile-requests',
    label: 'Profile Requests',
    icon: UserRoundPenIcon,
    permission: PERMISSIONS.studentProfileRequestsRead,
  },
  {
    href: '/admin/programs',
    label: 'Programs',
    icon: GraduationCapIcon,
    permission: PERMISSIONS.programsRead,
  },
  {
    href: '/admin/departments',
    label: 'Departments',
    icon: BuildingIcon,
    permission: PERMISSIONS.departmentsRead,
  },
  {
    href: '/admin/academic-sessions',
    label: 'Academic Sessions',
    icon: CalendarRangeIcon,
    permission: PERMISSIONS.academicSessionsRead,
  },
];

export const SEGMENT_LABELS: Record<string, string> = {
  admin: 'Dashboard',
  students: 'Students',
  programs: 'Programs',
  departments: 'Departments',
  'academic-sessions': 'Academic Sessions',
  imports: 'Imports',
  'student-accounts': 'Student Accounts',
  'profile-requests': 'Profile Requests',
  // Context-specific labels: "<parent>/<segment>".
  'students/new': 'New student',
  'imports/new': 'New import',
};

export function isNavActive(pathname: string, href: string): boolean {
  return href === '/admin'
    ? pathname === '/admin'
    : pathname === href || pathname.startsWith(`${href}/`);
}
