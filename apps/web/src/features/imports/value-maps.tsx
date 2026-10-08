'use client';

import { Label } from '@docversity/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@docversity/ui/components/select';
import {
  type ColumnMapping,
  type ImportSheet,
  type ImportValueMaps,
  normalizeImportValue,
  studentImportField,
  type ValueMappedField,
} from '@docversity/validation';
import { useSessionOptions } from '@/features/academic-sessions/api';
import { useActiveDepartmentOptions } from '@/features/departments/api';
import { useProgramOptions } from '@/features/programs/api';

const AUTOMATIC = '__auto__';
const NO_DEPARTMENT = '__none__';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'REVOKED', label: 'Revoked' },
];

const AUTOMATIC_LABEL: Record<ValueMappedField, string> = {
  programCode: 'Match by code or name',
  departmentCode: 'Match by code or name',
  academicSessionCode: 'Match by code or name',
  status: 'Use as written',
};

type Options = { value: string; label: string }[];

/** Default academic session for rows without one (e.g. a workbook with no session column). */
export function DefaultSessionSelect({
  value,
  onChange,
  required,
  problem,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  required: boolean;
  problem?: string;
  disabled?: boolean;
}) {
  const sessions = useSessionOptions();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="mapping-default-session">Academic session for every row</Label>
      <Select
        value={value ?? AUTOMATIC}
        onValueChange={(next) => {
          onChange(next === AUTOMATIC ? null : next);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id="mapping-default-session"
          className="w-full bg-card"
          aria-invalid={problem ? true : undefined}
          aria-describedby="mapping-default-session-hint"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTOMATIC}>None — use the session column</SelectItem>
          {sessions.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p
        id="mapping-default-session-hint"
        className={problem ? 'text-sm text-danger-text' : 'text-meta'}
      >
        {problem ??
          (required
            ? 'Required: this file has no session column mapped. Every row will be registered in this session.'
            : 'Optional: used for rows whose session cell is empty.')}
      </p>
    </div>
  );
}

/**
 * Explicit translations of the values found in category columns (course names → programs, school
 * names → departments, "Inactive" → a status…). Values left on "match automatically" are resolved by
 * the server: code first, then name — never guessed beyond that.
 */
export function ValueMapsSection({
  sheet,
  columns,
  valueMaps,
  onChange,
  problems,
  disabled,
}: {
  sheet: ImportSheet;
  columns: ColumnMapping;
  valueMaps: ImportValueMaps;
  onChange: (next: ImportValueMaps) => void;
  problems: Record<string, string>;
  disabled?: boolean;
}) {
  const programs = useProgramOptions(undefined);
  const departments = useActiveDepartmentOptions();
  const sessions = useSessionOptions();
  const optionsFor: Record<ValueMappedField, Options> = {
    programCode: programs.options,
    departmentCode: [{ value: NO_DEPARTMENT, label: 'No department' }, ...departments.options],
    academicSessionCode: sessions.options,
    status: STATUS_OPTIONS,
  };

  const fields = (['programCode', 'departmentCode', 'academicSessionCode', 'status'] as const)
    .map((field) => ({
      field,
      column: sheet.columns.find((candidate) => candidate.index === columns[field]),
    }))
    .filter((entry) => entry.column?.values && entry.column.values.length > 0);
  if (fields.length === 0) return null;

  const setValue = (field: ValueMappedField, key: string, next: string) => {
    const current = Object.entries(valueMaps[field] ?? {}).filter(([existing]) => existing !== key);
    if (next !== AUTOMATIC) current.push([key, next === NO_DEPARTMENT ? null : next]);
    // The status/record ids come from the option lists for this field, so the shape matches.
    onChange({ ...valueMaps, [field]: Object.fromEntries(current) });
  };

  return (
    <section aria-labelledby="value-maps-heading" className="flex flex-col gap-4">
      <div>
        <h3 id="value-maps-heading" className="text-sm font-semibold text-navy-950">
          Translate values
        </h3>
        <p className="text-meta">
          These columns contain a few repeated values. Match each one to a Docversity record, or
          leave it to be matched automatically by code or name.
        </p>
      </div>
      {fields.map(({ field, column }) => (
        <div key={field} className="rounded-lg border border-border">
          <p className="border-b border-border bg-muted/60 px-3 py-2 text-sm font-medium text-navy-950">
            {studentImportField(field).label} — column {column?.letter} “{column?.header}”
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {(column?.values ?? []).map((value) => {
              const key = normalizeImportValue(value);
              const map: Record<string, string | null> = valueMaps[field] ?? {};
              const selected = Object.prototype.hasOwnProperty.call(map, key)
                ? (map[key] ?? NO_DEPARTMENT)
                : AUTOMATIC;
              const id = `value-${field}-${key}`;
              const problem = problems[`valueMaps.${field}.${key}`];
              return (
                <li key={key} className="grid gap-2 p-3 md:grid-cols-2 md:items-center md:gap-4">
                  <Label htmlFor={id} className="break-words font-normal text-navy-950">
                    {value}
                  </Label>
                  <div className="flex flex-col gap-1">
                    <Select
                      value={selected}
                      onValueChange={(next) => {
                        setValue(field, key, next);
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger
                        id={id}
                        className="w-full bg-card"
                        aria-invalid={problem ? true : undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AUTOMATIC}>{AUTOMATIC_LABEL[field]}</SelectItem>
                        {optionsFor[field].map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {problem && <p className="text-sm text-danger-text">{problem}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
