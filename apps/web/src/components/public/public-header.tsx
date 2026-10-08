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
import { useState } from 'react';
import { Wordmark } from '@/components/brand/wordmark';
import { PUBLIC_ACCESS, PUBLIC_NAV } from './nav-items';

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function PublicHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 lg:px-8">
        <Link href="/" className="rounded-md" aria-label="Docversity home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 min-[1440px]:flex">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={cn(
                'rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                isActive(pathname, item.href) && 'bg-secondary text-navy-900',
              )}
            >
              {item.label}
              {!item.available && <span className="ml-1 text-xs">(Soon)</span>}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/student/register"
            className="hidden rounded text-sm font-medium text-brand hover:underline min-[1440px]:block"
          >
            Activate Student Account
          </Link>
          <Button asChild size="sm">
            <Link href="/student/login">Student Login</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link href="/admin/login">Staff Login</Link>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 min-[1440px]:hidden"
                aria-label="Open menu"
              >
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {[...PUBLIC_NAV, ...PUBLIC_ACCESS].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setOpen(false);
                    }}
                    aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                    className={cn(
                      'rounded-md px-3 py-3 text-sm font-medium hover:bg-muted',
                      isActive(pathname, item.href) && 'bg-secondary text-navy-900',
                    )}
                  >
                    {item.label}
                    {!item.available && (
                      <span className="ml-2 text-xs text-muted-foreground">Not available yet</span>
                    )}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
