'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * List state (page, search, filters) kept in the URL, so it survives reloads, can be shared and
 * works with the back button. Changing any filter resets to page 1.
 */
export function useListParams<const TKeys extends readonly string[]>(keys: TKeys) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values = useMemo(() => {
    const entries = ['page', 'search', ...keys].map(
      (key) => [key, searchParams.get(key) ?? ''] as const,
    );
    return Object.fromEntries(entries) as Record<'page' | 'search' | TKeys[number], string>;
  }, [keys, searchParams]);

  const page = Math.max(1, Number(values.page) || 1);

  const update = useCallback(
    (changes: Partial<Record<'page' | 'search' | TKeys[number], string | number>>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === '' || value === undefined || (key === 'page' && Number(value) <= 1))
          next.delete(key);
        else next.set(key, String(value));
      }
      if (!('page' in changes)) next.delete('page');
      const query = next.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}` as '/admin', { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { values, page, update };
}
