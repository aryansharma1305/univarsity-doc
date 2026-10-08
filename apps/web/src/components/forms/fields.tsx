'use client';

import type { ReactNode } from 'react';
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
  useFormState,
} from 'react-hook-form';
import { cn } from '@docversity/ui';
import { Label } from '@docversity/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@docversity/ui/components/select';

function getError(errors: object, name: string): string | undefined {
  const value = name
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      errors,
    );
  const message =
    value && typeof value === 'object' ? (value as { message?: unknown }).message : undefined;
  return typeof message === 'string' ? message : undefined;
}

/** Label + control + hint + error, wired with aria-invalid / aria-describedby. */
export function Field<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  required,
  className,
  children,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const { errors } = useFormState({ control, name });
  const error = getError(errors, name);
  const id = `field-${name.replaceAll('.', '-')}`;
  const describedBy =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="text-label">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger-text">
            *
          </span>
        ) : (
          <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        )}
      </Label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

const NONE = '__none__';

function selectValue(value: unknown, allowNone: boolean): string {
  if (typeof value === 'string' && value !== '') return value;
  return allowNone ? NONE : '';
}

/** Radix Select bound to a form field. `allowNone` adds an explicit "None" choice (stored as ''). */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  required,
  hint,
  placeholder = 'Select…',
  allowNone = false,
  disabled,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  options: readonly { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  placeholder?: string;
  allowNone?: boolean;
  disabled?: boolean;
}) {
  return (
    <Field control={control} name={name} label={label} required={required} hint={hint}>
      {(aria) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Select
              value={selectValue(field.value, allowNone)}
              onValueChange={(next) => {
                field.onChange(next === NONE ? '' : next);
              }}
              disabled={disabled}
            >
              <SelectTrigger {...aria} className="h-10 w-full" onBlur={field.onBlur}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {allowNone && <SelectItem value={NONE}>None</SelectItem>}
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
    </Field>
  );
}
