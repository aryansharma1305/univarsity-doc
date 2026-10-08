'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@docversity/ui';

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase() || '?';
}

const SIZES = { sm: 36, md: 56, lg: 96 } as const;

/**
 * The student's official photo when one is on record (served privately by the API from the student
 * session), otherwise — or if it cannot be loaded — their initials. Never a placeholder face.
 */
export function StudentAvatar({
  name,
  hasPhoto = false,
  size = 'md',
  className,
}: {
  name: string;
  hasPhoto?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const frame = cn(
    'flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-4 ring-white',
    size === 'sm' && 'size-9 text-sm ring-2',
    size === 'md' && 'size-14 text-lg',
    size === 'lg' && 'size-24 text-3xl',
    className,
  );
  if (hasPhoto && !failed) {
    return (
      <span className={cn(frame, 'bg-muted')}>
        <Image
          src="/api/v1/student/photo"
          alt={`Photo of ${name}`}
          width={SIZES[size]}
          height={SIZES[size]}
          unoptimized
          className="size-full object-cover"
          onError={() => {
            setFailed(true);
          }}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        frame,
        'bg-gradient-to-br from-brand to-navy-900 font-heading font-semibold text-white',
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
