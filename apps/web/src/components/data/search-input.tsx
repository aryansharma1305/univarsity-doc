'use client';

import { SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@docversity/ui/components/input';

/** Debounced search box (300 ms) with an accessible label. */
export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  // When the value changes from outside (e.g. back button), adopt it (state adjusted during render).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }
  useEffect(() => {
    if (draft === value || cancelled.current) return;
    const timer = setTimeout(() => {
      onChange(draft);
    }, 300);
    // The outgoing page can stay mounted while a link loads; its search must not cancel that navigation.
    const cancelOnNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download')) return;
      if (link.target && link.target !== '_self') return;
      if (link.origin === window.location.origin && link.pathname !== window.location.pathname) {
        cancelled.current = true;
        clearTimeout(timer);
      }
    };
    document.addEventListener('click', cancelOnNavigation, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', cancelOnNavigation, true);
    };
  }, [draft, value, onChange]);
  return (
    <div className="relative w-full sm:max-w-xs">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        value={draft}
        onChange={(event) => {
          cancelled.current = false;
          setDraft(event.target.value);
        }}
        className="h-10 bg-card pl-9"
      />
    </div>
  );
}
