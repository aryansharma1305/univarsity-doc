'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@docversity/ui/components/select';

const ALL = '__all__';

/** A list filter. The empty value means "no filter". */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  /** The 'no filter' choice, e.g. "All programs". */
  allLabel: string;
}) {
  return (
    <Select
      value={value || ALL}
      onValueChange={(next) => {
        onChange(next === ALL ? '' : next);
      }}
    >
      <SelectTrigger aria-label={label} className="h-10 w-full bg-card sm:w-44">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
