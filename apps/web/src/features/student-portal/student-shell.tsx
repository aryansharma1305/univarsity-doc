'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { LogOutIcon, MenuIcon } from 'lucide-react';
import { toast } from 'sonner';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { cn } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@docversity/ui/components/sheet';
import { Wordmark } from '@/components/brand/wordmark';
import { errorMessage } from '@/lib/api';
import { studentPortalApi } from './api';
import { STUDENT_NAV, isStudentNavActive } from './nav';
import { SoonBadge } from './portal-ui';
import { StudentAvatar } from './student-avatar';

const PRIMARY_MOBILE = [
  '/student',
  '/student/course',
  '/student/examinations',
  '/student/documents',
];
const MOBILE_LABELS: Record<string, string> = {
  '/student': 'Home',
  '/student/course': 'Course',
  '/student/examinations': 'Exams',
  '/student/documents': 'Documents',
};

function StudentNavigation({
  onNavigate,
  mobile = false,
  secondary = false,
}: {
  onNavigate?: () => void;
  mobile?: boolean;
  secondary?: boolean;
}) {
  const pathname = usePathname();
  const group = useId();
  const reduce = useReducedMotion();
  const items = mobile
    ? STUDENT_NAV.filter((item) => PRIMARY_MOBILE.includes(item.href))
    : secondary
      ? STUDENT_NAV.filter((item) => !PRIMARY_MOBILE.includes(item.href))
      : STUDENT_NAV;
  return (
    <LayoutGroup id={group}>
      <nav
        aria-label={mobile ? 'Student quick navigation' : 'Student'}
        className={cn(mobile ? 'grid grid-cols-4 gap-1' : 'flex flex-col gap-1 px-4 py-5')}
      >
        {items.map(({ href, label, icon: Icon, available }) => {
          const active = isStudentNavActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-12 items-center gap-3 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                mobile
                  ? 'flex-col justify-center gap-1 px-1 py-2 text-[11px] text-muted-foreground'
                  : 'px-3 py-3 text-muted-foreground hover:bg-secondary hover:text-navy-950',
                active && 'text-brand',
              )}
            >
              {active && (
                <motion.span
                  layoutId="student-section"
                  aria-hidden="true"
                  initial={false}
                  transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 rounded-lg bg-secondary"
                />
              )}
              <Icon aria-hidden="true" className="relative size-5 shrink-0" />
              <span className={cn('relative min-w-0', !mobile && 'flex-1')}>
                {mobile ? MOBILE_LABELS[href] : label}
              </span>
              {!available && (
                <span className="relative">
                  <SoonBadge />
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}

/** Student cookie/CSRF logout stays separate from staff authentication. */
export function StudentShell({
  name,
  hasPhoto = false,
  children,
}: {
  name: string;
  hasPhoto?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const section =
    STUDENT_NAV.find((item) => isStudentNavActive(pathname, item.href))?.label ?? 'Student portal';
  const signOut = () => {
    setPending(true);
    studentPortalApi
      .logout()
      .then(() => {
        router.replace('/student/login');
        router.refresh();
      })
      .catch((error: unknown) => {
        toast.error(errorMessage(error));
        setPending(false);
      });
  };
  return (
    <div className="min-h-screen bg-background pb-24 selection:bg-secondary selection:text-navy-950 lg:pb-0 lg:pl-64">
      <a
        href="#student-main"
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:m-2 focus:rounded focus:bg-card focus:p-3"
      >
        Skip to content
      </a>
      <aside
        aria-label="Student navigation"
        className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-card lg:flex"
      >
        <Link
          href="/student"
          aria-label="Student portal home"
          className="flex h-20 items-center border-b border-border px-6"
        >
          <Wordmark />
        </Link>
        <StudentNavigation />
        <div className="mx-5 mt-auto mb-6 flex items-center gap-3 border-t border-border pt-5">
          <StudentAvatar name={name} hasPhoto={hasPhoto} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy-950">{name}</p>
            <Link
              href="/student/settings"
              className="inline-flex min-h-10 items-center text-xs text-muted-foreground hover:text-brand"
            >
              Account settings
            </Link>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 lg:hidden"
                  aria-label="Open student navigation"
                >
                  <MenuIcon />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="h-dvh w-[min(20rem,calc(100vw-2rem))] gap-0 overflow-y-auto border-none bg-card [scrollbar-color:var(--dv-border-strong)_transparent] [&>button]:size-11"
              >
                <SheetHeader className="border-b border-border px-6 py-6">
                  <SheetTitle className="text-navy-950">
                    <Wordmark />
                  </SheetTitle>
                  <SheetDescription className="text-muted-foreground">
                    Student portal navigation
                  </SheetDescription>
                </SheetHeader>
                <StudentNavigation
                  secondary
                  onNavigate={() => {
                    setOpen(false);
                  }}
                />
                <div className="mx-6 mt-auto mb-6 border-t border-border pt-5">
                  <p className="text-sm font-semibold break-words text-navy-950">{name}</p>
                  <Link
                    href="/help"
                    onClick={() => {
                      setOpen(false);
                    }}
                    className="mt-2 inline-flex min-h-11 items-center rounded text-sm text-brand"
                  >
                    Portal help
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
            <span className="truncate font-heading text-base font-semibold text-navy-950">
              {section}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/student/profile"
              aria-label="View my profile"
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg"
            >
              <StudentAvatar name={name} hasPhoto={hasPhoto} size="sm" />
              <span className="hidden max-w-48 truncate text-sm font-medium text-navy-950 sm:block">
                {name}
              </span>
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={pending}
              onClick={signOut}
            >
              <LogOutIcon aria-hidden="true" />
              <span>{pending ? 'Signing out…' : 'Sign out'}</span>
            </Button>
          </div>
        </div>
      </header>
      <main
        id="student-main"
        tabIndex={-1}
        className="mx-auto max-w-[1440px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8 [&_button]:min-h-11 [&_input:not([type=radio]):not([type=checkbox])]:min-h-11 [&_input]:caret-brand [&_select]:min-h-11 [&_textarea]:caret-brand"
      >
        {children}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
        <StudentNavigation mobile />
      </div>
    </div>
  );
}
