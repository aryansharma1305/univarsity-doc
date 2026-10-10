import type { Permission } from '@docversity/types';
import { PERMISSIONS } from '@docversity/types';
import {
  BuildingIcon,
  ClipboardCheckIcon,
  ClipboardPenLineIcon,
  CalendarRangeIcon,
  FileSpreadsheetIcon,
  GraduationCapIcon,
  FileBadgeIcon,
  KeyRoundIcon,
  QrCodeIcon,
  WalletIcon,
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
    | '/admin/results'
    | '/admin/results/import'
    | '/admin/student-accounts'
    | '/admin/profile-requests'
    | '/admin/historical-documents'
    | '/admin/examinations'
    | '/admin/re-exam-applications'
    | '/admin/re-exam-payments'
    | '/admin/settings/re-exam-payments'
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
 * Admin navigation. Only implemented workflows are listed; results currently expose preview imports.
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
    href: '/admin/results',
    label: 'Draft Results',
    icon: ClipboardPenLineIcon,
    permission: PERMISSIONS.resultsRead,
  },
  {
    href: '/admin/results/import',
    label: 'Results Import',
    icon: FileSpreadsheetIcon,
    permission: PERMISSIONS.importsResultsRun,
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
    href: '/admin/examinations',
    label: 'Examinations',
    icon: ClipboardCheckIcon,
    permission: PERMISSIONS.examinationsRead,
  },
  {
    href: '/admin/re-exam-applications',
    label: 'Re-exam Applications',
    icon: ClipboardPenLineIcon,
    permission: PERMISSIONS.reExamApplicationsRead,
  },
  {
    href: '/admin/re-exam-payments',
    label: 'Re-exam Payments',
    icon: WalletIcon,
    permission: PERMISSIONS.reExamPaymentsRead,
  },
  {
    href: '/admin/settings/re-exam-payments',
    label: 'Payment Settings',
    icon: QrCodeIcon,
    permission: PERMISSIONS.reExamPaymentsConfigure,
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
  results: 'Results',
  'results/new': 'Enter marks',
  'results/*': 'Draft',
  'results/import': 'Results Import',
  'import/*': 'Preview',
  'student-accounts': 'Student Accounts',
  'profile-requests': 'Profile Requests',
  'historical-documents': 'Historical Certificates',
  'historical-documents/new': 'Upload',
  examinations: 'Examinations',
  'examinations/application': 'Examination application',
  're-exam-applications': 'Re-exam Applications',
  're-exam-applications/fees': 'Fee rules',
  're-exam-payments': 'Re-exam Payments',
  settings: 'Settings',
  'settings/re-exam-payments': 'Payment Settings',
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
