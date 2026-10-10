'use client';

import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  CornerDownLeftIcon,
  HelpCircleIcon,
  type LucideIcon,
  SearchIcon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import { cn } from '@docversity/ui';
import { FAQS } from '@/components/landing/content';

interface Command {
  label: string;
  group: 'Go to' | 'Questions';
  href: string;
  keywords: string;
  soon?: boolean;
  icon: LucideIcon;
}

const PAGES: readonly Command[] = [
  {
    label: 'Student Login',
    href: '/student/login',
    keywords: 'sign in login portal',
    group: 'Go to',
    icon: ArrowRightIcon,
  },
  {
    label: 'Activate your account',
    href: '/student/register',
    keywords: 'activate register activation code first time new',
    group: 'Go to',
    icon: ArrowRightIcon,
  },
  {
    label: 'Help',
    href: '/help',
    keywords: 'support problem contact',
    group: 'Go to',
    icon: ArrowRightIcon,
  },
  {
    label: 'Portal features',
    href: '/#features',
    keywords: 'profile course documents examinations re-exam payments',
    group: 'Go to',
    icon: ArrowRightIcon,
  },
  {
    label: 'Get started',
    href: '/#get-started',
    keywords: 'how steps activation',
    group: 'Go to',
    icon: ArrowRightIcon,
  },
  {
    label: 'What’s coming',
    href: '/#roadmap',
    keywords: 'roadmap results notifications verification planned',
    group: 'Go to',
    icon: ArrowRightIcon,
  },
  {
    label: 'Check Results',
    href: '/results',
    keywords: 'results marks semester',
    group: 'Go to',
    icon: ArrowRightIcon,
    soon: true,
  },
  {
    label: 'Certificate Verification',
    href: '/verify/certificate',
    keywords: 'verify certificate qr',
    group: 'Go to',
    icon: ArrowRightIcon,
    soon: true,
  },
  {
    label: 'Staff Login',
    href: '/admin/login',
    keywords: 'staff admin university',
    group: 'Go to',
    icon: ArrowRightIcon,
  },
];

const COMMANDS: readonly Command[] = [
  ...PAGES,
  ...FAQS.map((faq, index) => ({
    label: faq.question,
    href: `/#faq-${String(index)}`,
    keywords: faq.answer,
    group: 'Questions' as const,
    icon: HelpCircleIcon,
  })),
];

function search(query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...COMMANDS];
  const found = COMMANDS.filter((command) => {
    const haystack = `${command.label} ${command.keywords}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
  // Title matches first ("results" → Check Results before pages that only mention results).
  const inTitle = (command: Command) =>
    words.every((word) => command.label.toLowerCase().includes(word));
  return [...found.filter(inTitle), ...found.filter((command) => !inTitle(command))];
}

/** ⌘K / Ctrl+K search over public pages and student FAQs. */
export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const results = useMemo(() => search(query), [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${String(active)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (command: Command) => {
    setOpen(false);
    const [path, hash] = command.href.split('#');
    // Same-page anchors: set the hash directly so the FAQ hears `hashchange` and opens the answer.
    if (hash && (path === '' || path === pathname)) window.location.hash = hash;
    else router.push(command.href as Route);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="flex h-9 items-center gap-2 rounded-full border border-lp-hairline-strong px-3 text-sm text-lp-ink-soft transition-colors hover:border-lp-ink/30 hover:text-lp-ink"
      >
        <SearchIcon aria-hidden="true" className="size-4" />
        <span className="sr-only sm:not-sr-only">Search</span>
        <kbd className="hidden rounded border border-lp-hairline-strong px-1.5 font-sans text-[0.6875rem] lg:inline">
          ⌘K
        </kbd>
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) {
            setQuery('');
            setActive(0);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="top-[12vh] translate-y-0 gap-0 overflow-hidden rounded-2xl border-lp-hairline-strong bg-lp-surface p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Search Docversity</DialogTitle>
          <DialogDescription className="sr-only">
            Search pages and common student questions. Use the arrow keys to move and Enter to open.
          </DialogDescription>
          <div className="flex items-center gap-3 border-b border-lp-hairline px-4">
            <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-lp-ink-soft" />
            <input
              role="combobox"
              aria-expanded="true"
              aria-controls={`${baseId}-list`}
              aria-activedescendant={
                results[active] ? `${baseId}-option-${String(active)}` : undefined
              }
              aria-label="Search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActive((index) => Math.min(index + 1, results.length - 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActive((index) => Math.max(index - 1, 0));
                } else if (event.key === 'Enter') {
                  const command = results[active];
                  if (command) {
                    event.preventDefault();
                    go(command);
                  }
                }
              }}
              placeholder="Search, e.g. “password” or “re-exam”"
              className="h-14 flex-1 bg-transparent text-[0.9375rem] text-lp-ink outline-none placeholder:text-lp-ink-soft"
            />
            <kbd className="rounded border border-lp-hairline-strong px-1.5 text-[0.6875rem] text-lp-ink-soft">
              Esc
            </kbd>
          </div>
          <ul
            ref={listRef}
            id={`${baseId}-list`}
            role="listbox"
            aria-label="Results"
            className="max-h-[min(60vh,26rem)] overflow-y-auto p-2"
          >
            {results.length === 0 && (
              <li role="presentation" className="px-3 py-8 text-center text-sm text-lp-ink-soft">
                Nothing found for “{query}”.
              </li>
            )}
            {results.map((command, index) => {
              const header =
                command.group !== results[index - 1]?.group ? command.group : undefined;
              const selected = index === active;
              return (
                <li key={command.href} role="presentation">
                  {header && (
                    <p
                      role="presentation"
                      className="lp-type-eyebrow px-3 pt-3 pb-1.5 text-lp-ink-soft"
                    >
                      {header}
                    </p>
                  )}
                  <div
                    id={`${baseId}-option-${String(index)}`}
                    data-index={index}
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    onPointerMove={() => {
                      setActive(index);
                    }}
                    onClick={() => {
                      go(command);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') go(command);
                    }}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-lp-ink',
                      selected && 'bg-lp-accent-tint',
                    )}
                  >
                    <command.icon aria-hidden="true" className="size-4 shrink-0 text-lp-ink-soft" />
                    <span className="flex-1 truncate">{command.label}</span>
                    {command.soon && (
                      <span className="rounded-full border border-lp-hairline-strong px-1.5 text-[0.625rem] font-medium text-lp-ink-soft">
                        Coming soon
                      </span>
                    )}
                    {selected && (
                      <CornerDownLeftIcon
                        aria-hidden="true"
                        className="size-3.5 text-lp-ink-soft"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
