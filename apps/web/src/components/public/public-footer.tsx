import Link from 'next/link';
import { Wordmark } from '@/components/brand/wordmark';

const LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
] as const;

export function PublicFooter() {
  return (
    <footer className="mt-auto bg-navy-950 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex flex-col gap-2">
          <Wordmark inverted />
          <p className="max-w-md text-sm text-white/70">
            Academic Verification &amp; Records Portal.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded text-sm text-white/80 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-white/60 lg:px-8">
          © {new Date().getFullYear()} Docversity
        </p>
      </div>
    </footer>
  );
}
