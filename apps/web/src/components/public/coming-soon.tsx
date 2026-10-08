import Link from 'next/link';
import { ConstructionIcon } from 'lucide-react';
import { Button } from '@docversity/ui/components/button';

/**
 * Honest placeholder for features that do not exist yet. Deliberately contains no form fields,
 * so it can never be mistaken for a working verification page.
 */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning-text">
        <ConstructionIcon aria-hidden="true" className="size-6" />
      </span>
      <h1 className="text-page-title text-navy-950">{title}</h1>
      <p
        className="text-sm font-semibold tracking-wide text-warning-text uppercase"
        data-testid="not-available"
      >
        Not available yet — coming in a later phase
      </p>
      <p className="text-body text-muted-foreground">{description}</p>
      <Button asChild variant="outline">
        <Link href="/">Back to home</Link>
      </Button>
    </section>
  );
}
