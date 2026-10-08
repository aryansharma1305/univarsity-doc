'use client';

import { SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  // When the value changes from outside (e.g. back button), adopt it (state adjusted during render).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => {
      onChange(draft);
    }, 300);
    return () => {
      clearTimeout(timer);
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
          setDraft(event.target.value);
        }}
        className="h-10 bg-card pl-9"
      />
    </div>
  );
}
