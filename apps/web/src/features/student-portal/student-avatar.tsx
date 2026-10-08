import { cn } from '@docversity/ui';

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase() || '?';
}

/**
 * The student's initials. Photos are not served to the portal yet (photo submission and display arrive
 * with profile requests), so this never shows a placeholder face or a stock image.
 */
export function StudentAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand font-heading font-semibold text-white ring-4 ring-white',
        size === 'sm' && 'size-9 text-sm ring-2',
        size === 'md' && 'size-14 text-lg',
        size === 'lg' && 'size-24 text-3xl',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
