'use client';

import Link from 'next/link';
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
import { PUBLIC_HEADER_NAV } from './nav-items';

export function PublicHeader({ variant = 'default' }: { variant?: 'default' | 'landing' }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const landing = variant === 'landing';

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
        '@container top-0 z-40 border-b motion-safe:transition-[background-color,border-color,box-shadow]',
        landing
          ? 'fixed inset-x-0 border-transparent text-white'
          : 'sticky border-lp-hairline bg-lp-paper text-lp-ink',
        scrolled &&
          (landing
            ? 'border-white/10 bg-navy-950/95 backdrop-blur-md'
            : 'bg-lp-surface/95 shadow-sm backdrop-blur-md'),
      )}
    >
      <div
        className={cn(
          'mx-auto flex min-h-18 items-center justify-between gap-4 py-2',
          landing ? 'w-[92%] max-w-[1180px]' : 'max-w-7xl px-4 lg:px-8',
        )}
      >
        <Link
          href="/"
          className="min-w-0 rounded-md [&>span>span]:min-w-0 [&_svg]:size-[32px]"
          aria-label="Docversity home"
        >
          <Wordmark inverted={landing} adaptive={!landing} />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 @min-[80rem]:flex">
          {PUBLIC_HEADER_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-current={pathname === item.href ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium whitespace-nowrap',
                'motion-safe:transition-colors',
                landing
                  ? 'text-white/80 hover:bg-white/10 hover:text-white'
                  : 'text-lp-ink-soft hover:bg-lp-ink/5 hover:text-lp-ink',
                item.href === '/student/login' &&
                  (landing
                    ? 'ml-2 border border-[#ffc928]/60 px-4 text-white hover:bg-[#ffc928] hover:text-navy-950'
                    : 'ml-2 bg-lp-cta px-4 text-lp-cta-fg hover:bg-lp-cta-hover'),
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'size-[44px] shrink-0 rounded-full @min-[80rem]:hidden',
                landing && 'text-white hover:bg-white/10 hover:text-white',
              )}
              aria-label="Open menu"
            >
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className={cn(
              'w-[min(100vw,24rem)] overflow-y-auto',
              landing && 'border-white/10 bg-navy-950 text-white',
            )}
          >
            <SheetHeader>
              <SheetTitle className={landing ? 'text-white' : undefined}>Menu</SheetTitle>
              <SheetDescription className="sr-only">Public site navigation</SheetDescription>
            </SheetHeader>
            <nav aria-label="Mobile" className="flex flex-col gap-2 px-4 pb-8">
              {PUBLIC_HEADER_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={() => {
                    setOpen(false);
                  }}
                  aria-current={pathname === item.href ? 'page' : undefined}
                  className={cn(
                    'flex min-h-12 items-center rounded-lg px-3 py-3 text-sm font-medium',
                    landing
                      ? 'text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffc928]'
                      : 'hover:bg-muted',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
