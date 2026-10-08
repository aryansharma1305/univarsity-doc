import type { Permission } from '@docversity/types';
import { PERMISSIONS } from '@docversity/types';
import {
  BuildingIcon,
  CalendarRangeIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  UsersIcon,
} from 'lucide-react';

export interface AdminNavItem {
  href:
    | '/admin'
    | '/admin/students'
    | '/admin/programs'
    | '/admin/departments'
    | '/admin/academic-sessions';
  label: string;
  icon: LucideIcon;
  /** Hidden for users without this permission. */
  permission?: Permission;
}

/**
 * Admin navigation. Only features that exist are listed — results, certificates, imports and
 * templates are omitted until they are built (no fake navigation).
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
  new: 'New student',
};

export function isNavActive(pathname: string, href: string): boolean {
  return href === '/admin'
    ? pathname === '/admin'
    : pathname === href || pathname.startsWith(`${href}/`);
}
