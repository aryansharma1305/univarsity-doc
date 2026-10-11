import { isNavActive, type AdminNavItem } from './nav';

export const NAV_GROUPS = ['Workspace', 'Records', 'Academic', 'Examinations', 'Settings'] as const;

/** Presentation only: permissions and destinations remain owned by ADMIN_NAV. */
export function navGroup(href: string): (typeof NAV_GROUPS)[number] {
  if (href === '/admin/marksheet-templates') return 'Examinations';
  if (href.startsWith('/admin/settings')) return 'Settings';
  if (/^\/admin\/(results|examinations|re-exam)/.test(href)) return 'Examinations';
  if (/^\/admin\/(programs|subjects|departments|academic-sessions)/.test(href)) return 'Academic';
  if (
    /^\/admin\/(students|student-accounts|imports|profile-requests|historical-documents)/.test(href)
  )
    return 'Records';
  return 'Workspace';
}

export function activeNavHref(pathname: string, items: readonly AdminNavItem[]) {
  return items
    .filter((item) => isNavActive(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
