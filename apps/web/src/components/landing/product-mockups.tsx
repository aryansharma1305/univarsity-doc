'use client';

import {
  BellIcon,
  BookOpenIcon,
  ClipboardCheckIcon,
  ClipboardPenLineIcon,
  FileBadgeIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  UserRoundIcon,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@docversity/ui';
import { DocversityMark } from '@/components/brand/wordmark';

/*
 * Illustrations of real Docversity screens, drawn in markup so they stay sharp and match the live UI.
 * Labels mirror the student portal navigation and overview; values are skeletons — no invented data.
 * All of it is decorative (aria-hidden); the surrounding copy carries the meaning.
 */

export type PortalView = 'dashboard' | 'profile' | 'course' | 'examinations' | 'documents';

export const PORTAL_VIEWS: readonly { id: PortalView; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'profile', label: 'Profile' },
  { id: 'course', label: 'Course' },
  { id: 'examinations', label: 'Examinations' },
  { id: 'documents', label: 'Documents' },
];

const STUDENT_NAV: readonly {
  label: string;
  icon: typeof LayoutDashboardIcon;
  view?: PortalView;
  soon?: true;
}[] = [
  { label: 'Dashboard', icon: LayoutDashboardIcon, view: 'dashboard' },
  { label: 'My Profile', icon: UserRoundIcon, view: 'profile' },
  { label: 'Course Details', icon: BookOpenIcon, view: 'course' },
  { label: 'Examinations', icon: ClipboardPenLineIcon, view: 'examinations' },
  { label: 'Results', icon: ClipboardCheckIcon, soon: true },
  { label: 'My Documents', icon: FileBadgeIcon, view: 'documents' },
  { label: 'Notifications', icon: BellIcon, soon: true },
  { label: 'Account Settings', icon: SettingsIcon },
];

const VIEW_TITLES: Record<PortalView, string> = {
  dashboard: 'Dashboard',
  profile: 'My Profile',
  course: 'Course Details',
  examinations: 'Examinations',
  documents: 'My Documents',
};

function Bar({ className }: { className?: string }) {
  return <span className={cn('block rounded-full bg-slate-200/80', className)} />;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      data-lp-part="panel"
      className="rounded-lg border border-border bg-white p-3.5 shadow-card"
    >
      <p className="text-[0.8125rem] md:text-[0.6875rem] font-semibold text-navy-950">{title}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Pill({ tone, children }: { tone: 'success' | 'info' | 'muted'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-1.5 py-0.5 text-[0.6875rem] md:text-[0.5625rem] font-semibold',
        tone === 'success' && 'bg-success-soft text-success-text',
        tone === 'info' && 'bg-info-soft text-brand',
        tone === 'muted' && 'bg-slate-100 text-slate-600',
      )}
    >
      {children}
    </span>
  );
}

function DashboardView() {
  return (
    <>
      <div
        data-lp-part="panel"
        className="flex items-center gap-4 rounded-xl bg-navy-950 p-4 text-white"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-[0.875rem] md:text-[0.75rem] font-bold">
          ST
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] md:text-[0.5625rem] font-semibold tracking-wider text-white/65 uppercase">
            Student overview
          </p>
          <Bar className="mt-1.5 h-2.5 w-36 bg-white/80" />
          <Bar className="mt-1.5 h-1.5 w-24 bg-white/30" />
        </div>
        <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[0.75rem] md:text-[0.625rem] font-semibold sm:flex">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Active
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Panel title="Profile details">
          <div className="flex flex-col gap-1.5">
            <Bar className="h-1.5 w-24" />
            <Bar className="h-1.5 w-16" />
            <Bar className="h-1.5 w-20" />
          </div>
        </Panel>
        <Panel title="Your registrations">
          <div className="flex items-center justify-between gap-2">
            <Bar className="h-1.5 w-20" />
            <Pill tone="success">Active</Pill>
          </div>
          <Bar className="mt-2 h-1.5 w-14" />
        </Panel>
        <div className="hidden lg:block">
          <Panel title="Documents">
            <span className="flex items-center gap-2 text-[0.75rem] md:text-[0.625rem] text-muted-foreground">
              <FileBadgeIcon className="size-3.5 text-brand" />
              Published documents
            </span>
            <Bar className="mt-2 h-1.5 w-16" />
          </Panel>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel title="Examinations">
          <span className="flex items-center justify-between gap-2 text-[0.75rem] md:text-[0.625rem]">
            <span className="text-muted-foreground">Re-exam applications</span>
            <Pill tone="info">Open</Pill>
          </span>
          <p className="mt-2 text-[0.75rem] md:text-[0.625rem] text-muted-foreground">
            Results are not available yet
          </p>
        </Panel>
        <Panel title="Quick actions">
          <div className="flex flex-wrap gap-1.5">
            {['View profile', 'Course details', 'My documents'].map((action) => (
              <span
                key={action}
                className="rounded-md border border-border px-2 py-1 text-[0.75rem] md:text-[0.625rem] font-medium text-navy-950"
              >
                {action}
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

const PROFILE_FIELDS = [
  'Full name',
  'Date of birth',
  'Gender',
  'Father’s name',
  'Mother’s name',
  'Registration number',
] as const;

function ProfileView() {
  return (
    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="Personal details">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {PROFILE_FIELDS.map((field, index) => (
            <div key={field}>
              <dt className="text-[0.6875rem] md:text-[0.5625rem] font-medium text-muted-foreground">
                {field}
              </dt>
              <dd>
                <Bar className={cn('mt-1.5 h-1.5', index % 2 ? 'w-16' : 'w-24')} />
              </dd>
            </div>
          ))}
        </dl>
      </Panel>
      <div className="flex flex-col gap-3">
        <Panel title="Photo">
          <span className="flex size-14 items-center justify-center rounded-lg bg-secondary text-[0.875rem] md:text-[0.75rem] font-bold text-navy-900">
            ST
          </span>
        </Panel>
        <Panel title="Something wrong?">
          <p className="text-[0.75rem] md:text-[0.625rem] leading-relaxed text-muted-foreground">
            Request a correction. University staff review it before your record changes.
          </p>
          <span className="mt-2.5 inline-flex rounded-md bg-navy-950 px-2.5 py-1 text-[0.75rem] md:text-[0.625rem] font-semibold text-white">
            Request a correction
          </span>
        </Panel>
      </div>
    </div>
  );
}

function CourseView() {
  return (
    <>
      <Panel title="Program">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1.5">
            <Bar className="h-2 w-40" />
            <Bar className="h-1.5 w-24" />
          </div>
          <Pill tone="success">Curriculum assigned</Pill>
        </div>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2">
        {['Semester 1', 'Semester 2'].map((semester) => (
          <Panel key={semester} title={semester}>
            <ul className="flex flex-col gap-2">
              {['w-28', 'w-20', 'w-24', 'w-16'].map((width) => (
                <li key={width} className="flex items-center justify-between gap-2">
                  <Bar className={cn('h-1.5', width)} />
                  <Bar className="h-1.5 w-6" />
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </>
  );
}

function ExaminationsView() {
  return (
    <>
      <Panel title="Your examinations">
        <ul className="flex flex-col divide-y divide-border">
          {['w-32', 'w-24'].map((width) => (
            <li key={width} className="flex items-center justify-between gap-2 py-2 first:pt-0">
              <Bar className={cn('h-1.5', width)} />
              <span className="rounded-md border border-border px-2 py-0.5 text-[0.6875rem] md:text-[0.5625rem] font-semibold text-navy-950">
                Open exam app ↗
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel title="Re-examination">
          <span className="flex items-center justify-between gap-2 text-[0.75rem] md:text-[0.625rem]">
            <span className="text-muted-foreground">Applications</span>
            <Pill tone="info">Open</Pill>
          </span>
          <span className="mt-2.5 inline-flex rounded-md bg-navy-950 px-2.5 py-1 text-[0.75rem] md:text-[0.625rem] font-semibold text-white">
            Apply for a re-exam
          </span>
        </Panel>
        <Panel title="Results">
          <p className="text-[0.75rem] md:text-[0.625rem] text-muted-foreground">
            Results are not available yet
          </p>
          <Pill tone="muted">Coming soon</Pill>
        </Panel>
      </div>
    </>
  );
}

function DocumentsView() {
  return (
    <Panel title="Published documents">
      <ul className="flex flex-col divide-y divide-border">
        {['Certificate', 'Marksheet', 'Certificate'].map((kind, index) => (
          <li
            key={`${kind}-${String(index)}`}
            className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-brand">
              <FileBadgeIcon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] md:text-[0.6875rem] font-medium text-navy-950">
                {kind}
              </span>
              <Bar className="mt-1 h-1.5 w-20" />
            </span>
            <Pill tone="success">Published</Pill>
            <span className="rounded-md border border-border px-2 py-0.5 text-[0.6875rem] md:text-[0.5625rem] font-semibold text-navy-950">
              Download
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const VIEWS: Record<PortalView, () => ReactNode> = {
  dashboard: DashboardView,
  profile: ProfileView,
  course: CourseView,
  examinations: ExaminationsView,
  documents: DocumentsView,
};

/**
 * Desktop student portal, mirroring the student shell. `view` selects the screen; `onSelect` makes
 * the sidebar clickable with a mouse (keyboard users use the labelled tabs that control it).
 */
export function StudentWindow({
  className,
  view = 'dashboard',
  onSelect,
}: {
  className?: string;
  view?: PortalView;
  onSelect?: (view: PortalView) => void;
}) {
  const reduce = useReducedMotion();
  const View = VIEWS[view];
  return (
    <div
      aria-hidden="true"
      className={cn(
        'overflow-hidden rounded-[1.75rem] border-[6px] border-navy-950 bg-white shadow-lp-window select-none md:rounded-xl md:border-0 md:ring-1 md:ring-lp-hairline',
        className,
      )}
    >
      {/* Window chrome */}
      <div className="hidden h-9 items-center gap-3 border-b border-slate-200 bg-slate-50 px-3.5 md:flex">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-slate-300" />
          <span className="size-2.5 rounded-full bg-slate-300" />
          <span className="size-2.5 rounded-full bg-slate-300" />
        </span>
        <span className="mx-auto flex h-5 w-56 items-center justify-center rounded-md bg-white text-[0.75rem] md:text-[0.625rem] text-slate-500 ring-1 ring-slate-200">
          /student{view === 'dashboard' ? '' : `/${view}`}
        </span>
        <span className="w-10" />
      </div>
      <div className="flex">
        {/* Sidebar — matches the student shell */}
        <div data-lp-part="sidebar" className="hidden w-48 shrink-0 bg-navy-950 p-3 md:block">
          <div className="mb-4 flex items-center gap-2 px-1.5 pt-1">
            <DocversityMark className="size-6" />
            <span className="font-heading text-[0.8125rem] font-bold text-white">Docversity</span>
          </div>
          <ul className="flex flex-col gap-0.5">
            {STUDENT_NAV.map((item) => {
              const active = item.view === view;
              const target = item.view;
              return (
                <li key={item.label} data-lp-part="nav-item">
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={!target || !onSelect}
                    onClick={() => {
                      if (target) onSelect?.(target);
                    }}
                    className={cn(
                      'relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.8125rem] md:text-[0.6875rem] font-medium transition-colors',
                      active ? 'text-white' : 'text-white/65',
                      target && onSelect && 'cursor-pointer hover:text-white',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="lp-portal-nav"
                        className="absolute inset-0 rounded-md bg-white/10"
                        transition={
                          reduce
                            ? { duration: 0 }
                            : { type: 'spring', bounce: 0.15, duration: 0.45 }
                        }
                      />
                    )}
                    <item.icon className="relative size-3.5 shrink-0" />
                    <span className="relative truncate">{item.label}</span>
                    {item.soon && (
                      <span className="relative ml-auto rounded bg-white/10 px-1 text-[0.5625rem] md:text-[0.5rem] text-white/70">
                        Soon
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {/* Main */}
        <div className="min-w-0 flex-1 bg-background">
          <div className="flex h-11 items-center justify-between gap-3 border-b border-border bg-white px-4">
            <span className="flex items-center gap-2">
              <DocversityMark className="size-5 md:hidden" />
              <span className="text-[0.8125rem] md:text-[0.6875rem] font-semibold text-navy-950">
                {VIEW_TITLES[view]}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <BellIcon className="size-3.5 text-slate-500" />
              <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[0.6875rem] md:text-[0.5625rem] font-bold text-navy-900">
                ST
              </span>
            </span>
          </div>
          <div className="relative min-h-[19rem] p-4 sm:p-5">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col gap-3"
              >
                <View />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small floating status card used around the hero window. */
export function FloatCard({
  className,
  label,
  title,
  status,
  tone = 'pending',
  children,
}: {
  className?: string;
  label: string;
  title: string;
  status: string;
  tone?: 'pending' | 'success' | 'info';
  children?: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'w-60 rounded-xl bg-white p-3.5 shadow-lp-float ring-1 ring-lp-hairline select-none',
        className,
      )}
    >
      <p className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-[0.8125rem] font-semibold text-navy-950">{title}</p>
      <span
        className={cn(
          'mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold',
          tone === 'pending' && 'bg-warning-soft text-warning-text',
          tone === 'success' && 'bg-success-soft text-success-text',
          tone === 'info' && 'bg-info-soft text-brand',
        )}
      >
        <span
          className={cn(
            'size-1.5 rounded-full',
            tone === 'pending' && 'bg-warning',
            tone === 'success' && 'bg-success',
            tone === 'info' && 'bg-brand',
          )}
        />
        {status}
      </span>
      {children}
    </div>
  );
}

const STUDENT_SECTIONS = [
  { title: 'Profile details', lines: ['w-24', 'w-16'] },
  { title: 'Your registrations', lines: ['w-28', 'w-20'] },
  { title: 'Documents', lines: ['w-20'] },
] as const;

/** Phone-sized student portal overview. */
export function StudentPhone({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'w-64 rounded-[2.25rem] bg-navy-950 p-2 shadow-lp-window ring-1 ring-black/10 select-none',
        className,
      )}
    >
      <div className="overflow-hidden rounded-[1.75rem] bg-background">
        <div className="flex h-7 items-center justify-center">
          <span className="h-1.5 w-16 rounded-full bg-navy-950/90" />
        </div>
        <div className="flex items-center justify-between border-b border-border bg-white px-4 py-2.5">
          <span className="flex items-center gap-1.5">
            <DocversityMark className="size-5" />
            <span className="font-heading text-[0.75rem] font-bold text-navy-950">Docversity</span>
          </span>
          <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[0.5625rem] font-bold text-navy-900">
            ST
          </span>
        </div>
        <div className="flex flex-col gap-2.5 p-3">
          <div className="rounded-xl bg-navy-950 p-3 text-white">
            <p className="text-[0.5625rem] font-semibold tracking-wider text-white/60 uppercase">
              Student overview
            </p>
            <Bar className="mt-2 h-2.5 w-28 bg-white/80" />
            <Bar className="mt-1.5 h-1.5 w-20 bg-white/30" />
          </div>
          {STUDENT_SECTIONS.map((section) => (
            <div
              key={section.title}
              data-lp-part="phone-card"
              className="rounded-xl border border-border bg-white p-3"
            >
              <p className="text-[0.6875rem] font-semibold text-navy-950">{section.title}</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {section.lines.map((width) => (
                  <Bar key={width} className={cn('h-1.5', width)} />
                ))}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-dashed border-border-strong bg-white p-3">
            <p className="text-[0.6875rem] font-semibold text-navy-950">Examinations</p>
            <p className="mt-1 text-[0.625rem] text-muted-foreground">
              Results are not available yet
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
