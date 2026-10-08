'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { GraduationCapIcon, LogOutIcon, MenuIcon } from 'lucide-react';
import { toast } from 'sonner';
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

function StudentNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Student" className="flex flex-col gap-1 px-3 py-5">
      {STUDENT_NAV.map(({ href, label, icon: Icon, available }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={isStudentNavActive(pathname, href) ? 'page' : undefined}
          className={cn(
            'flex min-h-12 items-center gap-2.5 rounded-lg px-3 py-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
            isStudentNavActive(pathname, href) && 'bg-brand text-white hover:bg-brand',
          )}
        >
          <Icon aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {!available && <SoonBadge onDark />}
        </Link>
      ))}
    </nav>
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
    <div className="min-h-screen bg-background lg:pl-72">
      <a
        href="#student-main"
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:m-2 focus:rounded focus:bg-card focus:p-3"
      >
        Skip to content
      </a>
      <aside
        aria-label="Student navigation"
        className="fixed inset-y-0 left-0 hidden w-72 flex-col bg-navy-950 text-white lg:flex"
      >
        <Link
          href="/student"
          aria-label="Student portal home"
          className="flex h-20 items-center border-b border-white/10 px-6"
        >
          <Wordmark inverted />
        </Link>
        <StudentNavigation />
        <div className="mx-6 mt-auto mb-7 border-t border-white/15 pt-6">
          <GraduationCapIcon aria-hidden="true" className="mb-3 size-8 text-gold" />
          <p className="font-heading text-lg font-semibold">Your academic journey</p>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Your university records, together in one place.
          </p>
        </div>
      </aside>
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="flex h-20 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open student navigation"
                >
                  <MenuIcon />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 gap-0 border-none bg-navy-950 text-white [&>button]:text-white"
              >
                <SheetHeader className="border-b border-white/10 px-6 py-6">
                  <SheetTitle className="text-white">
                    <Wordmark inverted />
                  </SheetTitle>
                  <SheetDescription className="text-white/70">
                    Student portal navigation
                  </SheetDescription>
                </SheetHeader>
                <StudentNavigation
                  onNavigate={() => {
                    setOpen(false);
                  }}
                />
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
              className="flex items-center gap-2 rounded-lg"
            >
              <StudentAvatar name={name} hasPhoto={hasPhoto} size="sm" />
              <span className="hidden max-w-48 truncate text-sm font-medium text-navy-950 sm:block">
                {name}
              </span>
            </Link>
            <Button variant="outline" size="sm" disabled={pending} onClick={signOut}>
              <LogOutIcon aria-hidden="true" />
              <span>{pending ? 'Signing out…' : 'Sign out'}</span>
            </Button>
          </div>
        </div>
      </header>
      <main
        id="student-main"
        tabIndex={-1}
        className="mx-auto max-w-[1600px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
      >
        {children}
      </main>
    </div>
  );
}
