import Link from 'next/link';
import type { Route } from 'next';
import { Wordmark } from '@/components/brand/wordmark';
import { PUBLIC_ACCESS, PUBLIC_SECTIONS } from './nav-items';

const COLUMNS = [
  { title: 'Explore', links: PUBLIC_SECTIONS },
  { title: 'Access', links: PUBLIC_ACCESS },
  {
    title: 'Verification',
    links: [
      { href: '/results', label: 'Check Results', available: false },
      { href: '/verify/registration', label: 'Registration', available: false },
      { href: '/verify/certificate', label: 'Certificates', available: false },
      { href: '/verify/qr', label: 'Scan QR', available: false },
    ],
  },
  {
    title: 'Support',
    links: [
      { href: '/help', label: 'Help', available: true },
      { href: '/contact', label: 'Contact', available: true },
      { href: '/status', label: 'System status', available: true },
    ],
  },
] as const;

const LEGAL = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
] as const;

export function PublicFooter() {
  return (
    <footer className="mt-auto bg-navy-950 text-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 lg:grid-cols-[1.2fr_2fr] lg:px-8">
        <div className="flex flex-col gap-4">
          <Wordmark inverted />
          <p className="max-w-xs text-sm leading-relaxed text-white/65">
            Your profile, course, documents and examinations in one student portal.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={`Footer — ${column.title}`}>
              <p className="lp-type-eyebrow text-white/60">{column.title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href as Route}
                      className="rounded text-sm text-white/80 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                    {!link.available && (
                      <span className="ml-2 rounded-full border border-white/15 px-1.5 py-px text-[0.625rem] font-medium text-white/60">
                        Soon
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>© {new Date().getFullYear()} Docversity</p>
          <ul className="flex gap-5">
            {LEGAL.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="rounded hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
