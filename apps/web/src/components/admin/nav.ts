import type { Permission } from '@docversity/types';
import { PERMISSIONS } from '@docversity/types';
import {
  BuildingIcon,
  CalendarRangeIcon,
  FileSpreadsheetIcon,
  GraduationCapIcon,
  FileBadgeIcon,
  KeyRoundIcon,
  LibraryIcon,
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
    | '/admin/historical-documents'
    | '/admin/programs'
    | '/admin/subjects'
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
    href: '/admin/historical-documents',
    label: 'Historical Certificates',
    icon: FileBadgeIcon,
    permission: PERMISSIONS.historicalDocumentsRead,
  },
  {
    href: '/admin/programs',
    label: 'Course Management',
    icon: GraduationCapIcon,
    permission: PERMISSIONS.programsRead,
  },
  {
    href: '/admin/subjects',
    label: 'Subject Catalogue',
    icon: LibraryIcon,
    permission: PERMISSIONS.subjectsRead,
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
  programs: 'Course Management',
  subjects: 'Subject Catalogue',
  curricula: 'Curricula',
  departments: 'Departments',
  'academic-sessions': 'Academic Sessions',
  imports: 'Imports',
  'student-accounts': 'Student Accounts',
  'profile-requests': 'Profile Requests',
  'historical-documents': 'Historical Certificates',
  'historical-documents/new': 'Upload',
  // Context-specific labels: "<parent>/<segment>"; "<parent>/*" labels an id segment in the trail.
  'programs/*': 'Course',
  'students/new': 'New student',
  'imports/new': 'New import',
};

export function isNavActive(pathname: string, href: string): boolean {
  return href === '/admin'
    ? pathname === '/admin'
    : pathname === href || pathname.startsWith(`${href}/`);
}
