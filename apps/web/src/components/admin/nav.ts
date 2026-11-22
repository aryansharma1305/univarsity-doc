import type { Route } from 'next';
import type { Permission } from '@docversity/types';
import { PERMISSIONS } from '@docversity/types';
import {
  BarChart3Icon,
  BellIcon,
  BuildingIcon,
  MessagesSquareIcon,
  LifeBuoyIcon,
  CalendarRangeIcon,
  ClipboardCheckIcon,
  ClipboardPenLineIcon,
  FileBadgeIcon,
  FileSpreadsheetIcon,
  GraduationCapIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  UserRoundPenIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';

export const NAV_GROUPS = [
  'Workspace Navigation',
  'Admission',
  'Certificates',
  'Course Management',
  'Subject Management',
  'Examination',
  'Schools & Departments',
  'Imports & Reports',
  'Academic Session',
  'Chat & Communication',
  'Settings & Administration',
] as const;

export interface AdminNavItem {
  group: (typeof NAV_GROUPS)[number];
  href: Route;
  label: string;
  icon: LucideIcon;
  permissions?: readonly Permission[];
  subsection?: string;
}

const p = PERMISSIONS;

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { group: 'Workspace Navigation', href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon },

  {
    group: 'Admission',
    href: '/admin/students/new',
    label: 'New Admission',
    icon: UserRoundPenIcon,
    permissions: [p.studentsWrite, p.registrationsWrite],
  },
  {
    group: 'Admission',
    href: '/admin/students',
    label: 'Students',
    icon: UsersIcon,
    permissions: [p.studentsRead],
  },
  {
    group: 'Admission',
    href: '/admin/student-accounts',
    label: 'Student Accounts',
    icon: KeyRoundIcon,
    permissions: [p.studentAccountsRead],
  },
  {
    group: 'Admission',
    href: '/admin/official-records?tab=policies&service=admission-letter',
    label: 'Admission Letter Verification',
    icon: ShieldCheckIcon,
    permissions: [p.certificatesRead],
  },
  {
    group: 'Admission',
    href: '/admin/official-records?tab=documents&type=ADMISSION_LETTER',
    label: 'Issue Admission Letters',
    icon: FileBadgeIcon,
    permissions: [p.certificatesRead],
  },
  {
    group: 'Admission',
    href: '/admin/profile-requests',
    label: 'Profile Update Requests',
    icon: UserRoundPenIcon,
    permissions: [p.studentProfileRequestsRead],
  },

  {
    group: 'Certificates',
    href: '/admin/certificate-requests',
    label: 'Certificate Requests',
    icon: ClipboardCheckIcon,
    permissions: [p.certificateRequestsRead],
  },
  {
    group: 'Certificates',
    href: '/admin/official-records',
    label: 'Official records',
    icon: FileBadgeIcon,
    permissions: [p.certificatesRead],
  },
  {
    group: 'Certificates',
    href: '/admin/official-records?tab=documents&type=TRANSCRIPT',
    label: 'Transcript',
    subsection: 'Generate Certificates',
    icon: FileBadgeIcon,
    permissions: [p.certificatesRead, p.certificatesGenerate],
  },
  {
    group: 'Certificates',
    href: '/admin/official-records?tab=documents&type=PROVISIONAL',
    label: 'Provisional Certificate',
    subsection: 'Generate Certificates',
    icon: FileBadgeIcon,
    permissions: [p.certificatesRead, p.certificatesGenerate],
  },
  {
    group: 'Certificates',
    href: '/admin/official-records?tab=documents&type=CHARACTER',
    label: 'Character Certificate',
    subsection: 'Generate Certificates',
    icon: FileBadgeIcon,
    permissions: [p.certificatesRead, p.certificatesGenerate],
  },
  {
    group: 'Certificates',
    href: '/admin/official-records?tab=policies&service=certificate',
    label: 'Certificate Verification',
    icon: ShieldCheckIcon,
    permissions: [p.certificatesRead],
  },
  {
    group: 'Certificates',
    href: '/admin/historical-documents',
    label: 'Historical Certificates',
    icon: FileBadgeIcon,
    permissions: [p.historicalDocumentsRead],
  },
  {
    group: 'Certificates',
    href: '/admin/certificate-templates',
    label: 'Certificate Templates',
    icon: FileBadgeIcon,
    permissions: [p.templatesWrite],
  },

  {
    group: 'Course Management',
    href: '/admin/programs',
    label: 'Manage Courses',
    icon: GraduationCapIcon,
    permissions: [p.programsRead],
  },

  {
    group: 'Subject Management',
    href: '/admin/subjects',
    label: 'Subject Catalogue',
    icon: LibraryIcon,
    permissions: [p.subjectsRead],
  },
  {
    group: 'Subject Management',
    href: '/admin/programs?view=curricula',
    label: 'Course-wise Subject Mapping',
    icon: GraduationCapIcon,
    permissions: [p.programsRead],
  },

  {
    group: 'Examination',
    href: '/admin/examinations/application',
    label: 'Exam Form',
    icon: ClipboardPenLineIcon,
    permissions: [p.examinationsManage],
  },
  {
    group: 'Examination',
    href: '/admin/re-exam-applications',
    label: 'Re-exam Applications',
    icon: ClipboardPenLineIcon,
    permissions: [p.reExamApplicationsRead],
  },
  {
    group: 'Examination',
    href: '/admin/re-exam-payments',
    label: 'Re-exam Payments',
    icon: WalletIcon,
    permissions: [p.reExamPaymentsRead],
  },
  {
    group: 'Examination',
    href: '/admin/examinations',
    label: 'Exam Schedule',
    icon: CalendarRangeIcon,
    permissions: [p.examinationsRead],
  },
  {
    group: 'Examination',
    href: '/admin/results/review',
    label: 'Result Management',
    icon: ClipboardCheckIcon,
    permissions: [p.resultsRead],
  },
  {
    group: 'Examination',
    href: '/admin/results/new',
    label: 'Marks Entry',
    icon: ClipboardPenLineIcon,
    permissions: [p.resultsRead, p.resultsWrite],
  },
  {
    group: 'Examination',
    href: '/admin/results',
    label: 'Draft Results',
    icon: ClipboardPenLineIcon,
    permissions: [p.resultsRead],
  },
  {
    group: 'Examination',
    href: '/admin/marksheet-templates',
    label: 'Marksheet Templates',
    icon: FileBadgeIcon,
    permissions: [p.templatesWrite],
  },

  {
    group: 'Schools & Departments',
    href: '/admin/departments',
    label: 'Manage Departments',
    icon: BuildingIcon,
    permissions: [p.departmentsRead],
  },

  {
    group: 'Imports & Reports',
    href: '/admin/results/import',
    label: 'Result Import',
    icon: FileSpreadsheetIcon,
    permissions: [p.importsResultsRun],
  },
  {
    group: 'Imports & Reports',
    href: '/admin/imports/new',
    label: 'Registration Import',
    icon: FileSpreadsheetIcon,
    permissions: [p.importsStudentsRun],
  },
  {
    group: 'Imports & Reports',
    href: '/admin/imports',
    label: 'Imports',
    icon: FileSpreadsheetIcon,
    permissions: [p.importsRead],
  },
  {
    // Every staff role may open it; the page lists only the reports the account can read.
    group: 'Imports & Reports',
    href: '/admin/reports',
    label: 'Reports',
    icon: BarChart3Icon,
  },

  {
    group: 'Academic Session',
    href: '/admin/academic-sessions',
    label: 'Manage Academic Sessions',
    icon: CalendarRangeIcon,
    permissions: [p.academicSessionsRead],
  },
  {
    group: 'Academic Session',
    href: '/admin/students?view=session',
    label: 'Session-wise Student Records',
    icon: UsersIcon,
    permissions: [p.studentsRead, p.academicSessionsRead],
  },

  {
    group: 'Chat & Communication',
    href: '/admin/messages',
    label: 'Student Messages',
    icon: MessagesSquareIcon,
    permissions: [p.studentMessagesRead],
  },
  {
    group: 'Chat & Communication',
    href: '/admin/verification-queries',
    label: 'Verification Queries',
    icon: LifeBuoyIcon,
    permissions: [p.verificationQueriesRead],
  },
  {
    group: 'Chat & Communication',
    href: '/admin/notifications',
    label: 'Notifications',
    icon: BellIcon,
  },
  {
    group: 'Chat & Communication',
    href: '/admin/official-records?tab=audit',
    label: 'Verification Audit',
    icon: ShieldCheckIcon,
    permissions: [p.certificatesRead, p.auditRead],
  },

  {
    group: 'Settings & Administration',
    href: '/admin/settings/profile',
    label: 'Admin Profile',
    icon: UserRoundPenIcon,
  },
  {
    group: 'Settings & Administration',
    href: '/admin/settings/staff',
    label: 'Staff Users & Roles',
    icon: UsersIcon,
    permissions: [p.usersManage],
  },
  {
    group: 'Settings & Administration',
    href: '/admin/settings/re-exam-payments',
    label: 'Payment Settings',
    icon: QrCodeIcon,
    permissions: [p.reExamPaymentsConfigure],
  },
];

export function visibleAdminNav(permissions: readonly string[]) {
  return ADMIN_NAV.filter(
    (item) => item.permissions?.every((value) => permissions.includes(value)) ?? true,
  );
}

export const SEGMENT_LABELS: Record<string, string> = {
  'certificate-requests': 'Certificate Requests',
  'certificate-requests/*': 'Application',
  admin: 'Dashboard',
  'official-records': 'Official records',
  'settings/profile': 'Admin Profile',
  'settings/staff': 'Staff Users & Roles',
  'certificate-templates': 'Certificate Templates',
  'marksheet-templates': 'Marksheet Templates',
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
  messages: 'Student Messages',
  'messages/*': 'Conversation',
  'verification-queries': 'Verification Queries',
  'verification-queries/*': 'Query',
  notifications: 'Notifications',
  reports: 'Reports',
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
