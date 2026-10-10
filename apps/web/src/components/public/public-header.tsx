'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { MenuIcon } from 'lucide-react';
import { Button } from '@docversity/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@docversity/ui/components/sheet';
import { cn } from '@docversity/ui';
import { useEffect, useState } from 'react';
import { Wordmark } from '@/components/brand/wordmark';
import { CommandPalette } from './command-palette';
import { PUBLIC_ACCESS, PUBLIC_NAV, PUBLIC_SECTIONS } from './nav-items';

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function PublicHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300',
        scrolled
          ? 'border-lp-hairline bg-lp-surface/90 shadow-[0_1px_12px_-6px_rgb(3_20_47/0.12)] backdrop-blur-md'
          : 'border-transparent bg-lp-paper',
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
        <Link href="/" className="rounded-md" aria-label="Docversity home">
          <span className="sm:hidden">
            <Wordmark adaptive subtitle={false} />
          </span>
          <span className="hidden sm:block">
            <Wordmark adaptive large />
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {PUBLIC_SECTIONS.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-lp-ink-soft transition-colors hover:bg-lp-ink/[0.04] hover:text-lp-ink"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/help"
            aria-current={isActive(pathname, '/help') ? 'page' : undefined}
            className={cn(
              'rounded-full px-3.5 py-2 text-sm font-medium text-lp-ink-soft transition-colors hover:bg-lp-ink/[0.04] hover:text-lp-ink',
              isActive(pathname, '/help') && 'text-lp-ink',
            )}
          >
            Help
          </Link>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <CommandPalette />
          <Link
            href="/admin/login"
            className="hidden rounded-full px-3.5 py-2 text-sm font-medium text-lp-ink-soft transition-colors hover:text-lp-ink sm:inline-flex"
          >
            Staff Login
          </Link>
          <Link
            href="/student/login"
            className="inline-flex h-9 items-center rounded-full bg-lp-cta px-4 whitespace-nowrap text-sm font-semibold text-lp-cta-fg transition-colors hover:bg-lp-cta-hover"
          >
            Student Login
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 rounded-full lg:hidden"
                aria-label="Open menu"
              >
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-6 px-4 pb-8">
                {(
                  [
                    ['Explore', PUBLIC_SECTIONS],
                    ['Services', PUBLIC_NAV],
                    ['Sign in', PUBLIC_ACCESS],
                  ] as const
                ).map(([group, items]) => (
                  <div key={group} className="flex flex-col gap-1">
                    <p className="lp-type-eyebrow px-3 pb-1 text-muted-foreground">{group}</p>
                    {items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href as Route}
                        onClick={() => {
                          setOpen(false);
                        }}
                        aria-current={
                          !item.href.includes('#') && isActive(pathname, item.href)
                            ? 'page'
                            : undefined
                        }
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted',
                          !item.href.includes('#') &&
                            isActive(pathname, item.href) &&
                            'bg-secondary text-navy-900',
                        )}
                      >
                        {item.label}
                        {!item.available && (
                          <span className="text-xs font-normal text-muted-foreground">
                            Not available yet
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
