import { CheckIcon } from 'lucide-react';
import type { ImportStatus } from '@docversity/validation';
import { cn } from '@docversity/ui/lib/utils';

export const IMPORT_STEPS = [
  'Download template',
  'Upload file',
  'Map columns',
  'Validate',
  'Review',
  'Import',
] as const;

/** Short visible labels (the full names are announced to screen readers). */
const SHORT_LABELS = ['Template', 'Upload', 'Map columns', 'Validate', 'Review', 'Import'] as const;

/** The wizard step (0-based) a persisted import status belongs to. */
export function stepForStatus(status: ImportStatus): number {
  switch (status) {
    case 'UPLOADED':
      return 1;
    case 'MAPPING':
      return 2;
    case 'VALIDATING':
      return 3;
    case 'VALIDATED':
      return 4;
    case 'PROCESSING':
    case 'COMPLETED':
      return 5;
    case 'FAILED':
    case 'CANCELLED':
      return -1;
  }
}

/**
 * Six-step progress indicator. An ordered list with `aria-current="step"`, so screen readers announce
 * "step 3 of 6, Map columns, current step"; on small screens only the current step's name is shown.
 */
export function ImportStepper({
  current,
  complete = false,
  steps = IMPORT_STEPS,
  shortLabels = SHORT_LABELS,
}: {
  current: number;
  complete?: boolean;
  steps?: readonly string[];
  shortLabels?: readonly string[];
}) {
  return (
    <nav aria-label="Import steps" className="mb-6">
      <ol className="flex items-center gap-1 sm:gap-2">
        {steps.map((label, index) => {
          const done = index < current || (complete && index === current);
          const active = index === current && !complete;
          return (
            <li
              key={label}
              aria-current={active ? 'step' : undefined}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1',
                  done && 'bg-brand text-white ring-brand',
                  active && 'bg-card text-brand ring-2 ring-brand',
                  !done && !active && 'bg-muted text-muted-foreground ring-border-strong',
                )}
              >
                {done ? <CheckIcon aria-hidden="true" className="size-4" /> : index + 1}
                <span className="sr-only">
                  {`, step ${index + 1} of ${steps.length}, ${label}${done ? ', done' : active ? ', current step' : ''}`}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'hidden text-sm whitespace-nowrap lg:inline',
                  active ? 'font-semibold text-navy-950' : 'text-muted-foreground',
                )}
              >
                {shortLabels[index]}
              </span>
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="hidden h-px min-w-3 flex-1 bg-border-strong sm:block"
                />
              )}
            </li>
          );
        })}
      </ol>
      {current >= 0 && current < steps.length && (
        <p aria-hidden="true" className="mt-2 text-sm font-semibold text-navy-950 lg:hidden">
          Step {current + 1} of {steps.length} · {steps[current]}
          {complete ? ' · done' : ''}
        </p>
      )}
    </nav>
  );
}

/** Real persisted progress (0–100) of a worker step. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-sm">
        <span className="text-navy-950">{label}</span>
        <span className="text-muted-foreground tabular">{value}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
