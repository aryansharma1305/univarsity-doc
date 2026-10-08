import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRightIcon,
  AwardIcon,
  ClipboardCheckIcon,
  QrCodeIcon,
  UserCheckIcon,
} from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';

export const metadata: Metadata = {
  title: { absolute: 'Docversity — Academic Verification & Records Portal' },
};

const SERVICES = [
  {
    href: '/results',
    title: 'Check Results',
    description: 'Look up published semester results using your registration details.',
    icon: ClipboardCheckIcon,
  },
  {
    href: '/verify/registration',
    title: 'Registration Verification',
    description: 'Confirm that a registration number belongs to an enrolled student.',
    icon: UserCheckIcon,
  },
  {
    href: '/verify/certificate',
    title: 'Certificate Verification',
    description: 'Check a certificate number against the university’s issued records.',
    icon: AwardIcon,
  },
  {
    href: '/verify/qr',
    title: 'Scan QR',
    description: 'Verify a printed document by scanning its QR code.',
    icon: QrCodeIcon,
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="border-b border-border bg-gradient-to-b from-info-soft to-background">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-4 py-16 text-center md:py-24 lg:px-8">
          <FadeIn>
            <p className="text-sm font-semibold tracking-wide text-brand uppercase">Docversity</p>
          </FadeIn>
          <FadeIn delay={0.05}>
            <h1 className="max-w-3xl font-heading text-3xl font-bold tracking-tight text-navy-950 md:text-5xl">
              Academic Verification &amp; Records Portal
            </h1>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
              Access your student records through the student portal. Public result and document
              verification services are planned and are not available yet.
            </p>
          </FadeIn>
        </div>
      </section>

      <section
        aria-labelledby="services-heading"
        className="mx-auto max-w-7xl px-4 py-12 lg:px-8 md:py-16"
      >
        <h2 id="services-heading" className="text-section-title mb-6 text-navy-950">
          Services
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((service, index) => (
            <li key={service.href}>
              <FadeIn delay={0.05 * index} className="h-full">
                <Link
                  href={service.href}
                  className="group flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-card transition hover:border-brand/40 hover:shadow-raised"
                >
                  <span className="flex size-11 items-center justify-center rounded-lg bg-secondary text-brand">
                    <service.icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="text-card-title text-navy-950">{service.title}</span>
                  <span className="self-start rounded bg-secondary px-2 py-1 text-xs font-medium text-navy-900">
                    Not available yet
                  </span>
                  <span className="text-sm text-muted-foreground">{service.description}</span>
                  <span className="mt-auto flex items-center gap-1 pt-2 text-sm font-medium text-brand">
                    View availability
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </FadeIn>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 lg:px-8">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-card md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-section-title text-navy-950">Student portal</h2>
            <p className="text-sm text-muted-foreground">
              Sign in to view your university records, or activate your account with a
              university-issued code.
            </p>
          </div>
          <Link
            href="/student/login"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-brand-hover"
          >
            Student Login
          </Link>
          <Link
            href="/student/register"
            className="rounded text-sm font-medium text-brand hover:underline"
          >
            Activate Student Account
          </Link>
        </div>
      </section>
    </>
  );
}
