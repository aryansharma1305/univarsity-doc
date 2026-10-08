'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronsLeftIcon, ChevronsRightIcon, MenuIcon } from 'lucide-react';
import { type ReactNode, useState, useSyncExternalStore } from 'react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@docversity/ui/components/tooltip';
import type { AuthUser } from '@docversity/validation';
import { DocversityMark, Wordmark } from '@/components/brand/wordmark';
import { QueryProvider } from '@/components/providers/query-provider';
import { SessionProvider } from '@/components/providers/session-context';
import { AdminBreadcrumbs } from './admin-breadcrumbs';
import { BreadcrumbLabelProvider } from './breadcrumb-context';
import { ADMIN_NAV, isNavActive } from './nav';
import { UserMenu } from './user-menu';

const COLLAPSE_KEY = 'docversity.admin.sidebarCollapsed';
const COLLAPSE_EVENT = 'docversity:sidebar';

/** Per-browser sidebar preference in localStorage (a convenience only; failures are ignored). */
const sidebarPreference = {
  subscribe: (callback: () => void) => {
    window.addEventListener('storage', callback);
    window.addEventListener(COLLAPSE_EVENT, callback);
    return () => {
      window.removeEventListener('storage', callback);
      window.removeEventListener(COLLAPSE_EVENT, callback);
    };
  },
  get: (): boolean => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  },
  set: (collapsed: boolean): void => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      // storage unavailable — the preference just won't persist
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  },
};

function NavLinks({
  user,
  collapsed = false,
  onNavigate,
}: {
  user: AuthUser;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = ADMIN_NAV.filter(
    (item) => !item.permission || user.permissions.includes(item.permission),
  );
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isNavActive(pathname, item.href);
        const link = (
          <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white',
              active && 'bg-brand text-white hover:bg-brand',
              collapsed && 'justify-center px-0',
            )}
          >
            <item.icon aria-hidden="true" className="size-5 shrink-0" />
            <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
          </Link>
        );
        return (
          <li key={item.href}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={pathname}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

export function AdminShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  // Server render is always expanded; the stored preference applies after hydration.
  const collapsed = useSyncExternalStore(
    sidebarPreference.subscribe,
    sidebarPreference.get,
    () => false,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleCollapsed() {
    sidebarPreference.set(!collapsed);
  }

  return (
    <QueryProvider>
      <SessionProvider user={user}>
        <TooltipProvider delayDuration={200}>
          <BreadcrumbLabelProvider>
            <a
              href="#admin-main"
              className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
            >
              Skip to content
            </a>
            <div className="flex min-h-screen">
              {/* Desktop sidebar */}
              <aside
                className={cn(
                  'sticky top-0 hidden h-screen shrink-0 flex-col bg-navy-950 transition-[width] duration-200 lg:flex',
                  collapsed ? 'w-[4.5rem]' : 'w-64',
                )}
                aria-label="Admin navigation"
              >
                <div
                  className={cn('flex h-16 items-center px-4', collapsed && 'justify-center px-0')}
                >
                  <Link href="/admin" aria-label="Docversity admin home" className="rounded-md">
                    {collapsed ? <DocversityMark /> : <Wordmark inverted />}
                  </Link>
                </div>
                <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Sections">
                  <NavLinks user={user} collapsed={collapsed} />
                </nav>
                <div className="border-t border-white/10 p-3">
                  <Button
                    variant="ghost"
                    onClick={toggleCollapsed}
                    className={cn(
                      'w-full justify-start text-white/75 hover:bg-white/10 hover:text-white',
                      collapsed && 'justify-center',
                    )}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    aria-expanded={!collapsed}
                  >
                    {collapsed ? <ChevronsRightIcon /> : <ChevronsLeftIcon />}
                    {!collapsed && <span>Collapse</span>}
                  </Button>
                </div>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-white/95 px-4 backdrop-blur lg:px-8">
                  <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                    <SheetTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-10 lg:hidden"
                        aria-label="Open navigation"
                      >
                        <MenuIcon />
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="left"
                      className="w-72 border-none bg-navy-950 p-0 text-white"
                    >
                      <SheetHeader className="h-16 justify-center px-4">
                        <SheetTitle className="sr-only">Navigation</SheetTitle>
                        <SheetDescription className="sr-only">Admin sections</SheetDescription>
                        <Wordmark inverted />
                      </SheetHeader>
                      <nav className="px-3 py-4" aria-label="Sections">
                        <NavLinks
                          user={user}
                          onNavigate={() => {
                            setMobileOpen(false);
                          }}
                        />
                      </nav>
                    </SheetContent>
                  </Sheet>
                  <div className="min-w-0 flex-1">
                    <AdminBreadcrumbs />
                  </div>
                  <UserMenu />
                </header>
                <main
                  id="admin-main"
                  className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8"
                >
                  <PageTransition>{children}</PageTransition>
                </main>
              </div>
            </div>
          </BreadcrumbLabelProvider>
        </TooltipProvider>
      </SessionProvider>
    </QueryProvider>
  );
}
