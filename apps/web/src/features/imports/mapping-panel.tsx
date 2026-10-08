'use client';

import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@docversity/ui/components/card';
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
  type ImportDateFormat,
  type ImportJob,
  type ImportSheet,
  type ImportValueMaps,
  STUDENT_IMPORT_FIELDS,
} from '@docversity/validation';
import { ApiError, errorMessage } from '@/lib/api';
import { importsApi, useImportStep } from './api';
import { formatCount } from './labels';
import { DefaultSessionSelect, ValueMapsSection } from './value-maps';

const NOT_MAPPED = '__none__';

const DATE_FORMATS: { value: ImportDateFormat; label: string }[] = [
  { value: 'ISO', label: 'YYYY-MM-DD only (recommended)' },
  { value: 'DMY', label: 'Also DD/MM/YYYY (day first)' },
  { value: 'MDY', label: 'Also MM/DD/YYYY (month first)' },
];

function initialSheet(job: ImportJob): ImportSheet | undefined {
  const usable = job.sheets.filter((sheet) => sheet.problem === null);
  return (
    job.sheets.find((sheet) => sheet.name === job.mapping?.worksheet) ??
    usable.find((sheet) => sheet.name.trim().toLowerCase() === 'students') ??
    usable[0] ??
    job.sheets[0]
  );
}

/**
 * Step 3: choose the worksheet and confirm which column feeds each field. Suggestions come from the
 * server's deterministic header matching; nothing is validated until the administrator confirms.
 */
export function MappingPanel({
  job,
  canRun,
  onCancelEdit,
}: {
  job: ImportJob;
  canRun: boolean;
  onCancelEdit?: () => void;
}) {
  const first = initialSheet(job);
  const [sheetName, setSheetName] = useState(first?.name ?? '');
  const sheet = job.sheets.find((candidate) => candidate.name === sheetName);
  const [columns, setColumns] = useState<ColumnMapping>(
    job.mapping && job.mapping.worksheet === first?.name
      ? job.mapping.columns
      : (first?.suggestedMapping ?? {}),
  );
  const [dateFormat, setDateFormat] = useState<ImportDateFormat>(job.mapping?.dateFormat ?? 'ISO');
  const [valueMaps, setValueMaps] = useState<ImportValueMaps>(job.mapping?.valueMaps ?? {});
  const [defaultSession, setDefaultSession] = useState<string | null>(
    job.mapping?.defaultAcademicSessionId ?? null,
  );
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const save = useImportStep(job.id, (body: Parameters<typeof importsApi.saveMapping>[1]) =>
    importsApi.saveMapping(job.id, body),
  );
  const validate = useImportStep(job.id, () => importsApi.validate(job.id));
  const busy = save.isPending || validate.isPending;

  const chooseSheet = (name: string) => {
    setSheetName(name);
    const next = job.sheets.find((candidate) => candidate.name === name);
    setColumns(next?.suggestedMapping ?? {});
    setValueMaps({});
    setProblems({});
  };

  const submit = async () => {
    setProblems({});
    setFormError(null);
    try {
      await save.mutateAsync({
        worksheet: sheetName,
        columns,
        dateFormat,
        valueMaps,
        defaultAcademicSessionId: defaultSession,
      });
      await validate.mutateAsync(undefined);
    } catch (error) {
      if (error instanceof ApiError && error.details.length > 0) {
        setProblems(
          Object.fromEntries(error.details.map((detail) => [detail.path, detail.message])),
        );
        setFormError('Check the highlighted fields.');
      } else {
        setFormError(errorMessage(error));
      }
    }
  };

  const mappedCount = Object.values(columns).filter((value) => value !== null).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-card-title">Map columns</h2>
        </CardTitle>
        <CardDescription>
          Choose the column that holds each field. Suggestions are based on the column headers —
          check them. Unmapped optional fields are simply not imported.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mapping-sheet">Worksheet</Label>
            <Select value={sheetName} onValueChange={chooseSheet} disabled={!canRun || busy}>
              <SelectTrigger id="mapping-sheet" className="w-full bg-card">
                <SelectValue placeholder="Choose a worksheet" />
              </SelectTrigger>
              <SelectContent>
                {job.sheets.map((candidate) => (
                  <SelectItem key={candidate.name} value={candidate.name}>
                    {candidate.name} — {formatCount(candidate.rowCount)} rows
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(sheet?.problem ?? problems.worksheet) && (
              <p role="alert" className="text-sm text-danger-text">
                {sheet?.problem ?? problems.worksheet}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mapping-dates">Text dates</Label>
            <Select
              value={dateFormat}
              onValueChange={(value) => {
                setDateFormat(value as ImportDateFormat);
              }}
              disabled={!canRun || busy}
            >
              <SelectTrigger
                id="mapping-dates"
                className="w-full bg-card"
                aria-describedby="mapping-dates-hint"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((format) => (
                  <SelectItem key={format.value} value={format.value}>
                    {format.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="mapping-dates-hint" className="text-meta">
              Real Excel date cells are always read correctly. Text like 01/02/2026 is only accepted
              if you say which part is the day.
            </p>
          </div>
        </div>

        {sheet?.problem === null && (
          <ul
            className="flex flex-col divide-y divide-border rounded-lg border border-border"
            aria-label="Field mapping"
          >
            {STUDENT_IMPORT_FIELDS.map((field) => {
              const id = `map-${field.key}`;
              const problem = problems[`columns.${field.key}`];
              const value = columns[field.key];
              return (
                <li
                  key={field.key}
                  className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label htmlFor={id} className="font-medium text-navy-950">
                        {field.label}
                      </Label>
                      {field.required ? (
                        <StatusBadge tone="info">Required</StatusBadge>
                      ) : (
                        <span className="text-meta">Optional</span>
                      )}
                    </div>
                    <p className="mt-1 text-meta">{field.description}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Select
                      value={value ? String(value) : NOT_MAPPED}
                      onValueChange={(next) => {
                        setColumns((current) => ({
                          ...current,
                          [field.key]: next === NOT_MAPPED ? null : Number(next),
                        }));
                      }}
                      disabled={!canRun || busy}
                    >
                      <SelectTrigger
                        id={id}
                        className="w-full bg-card"
                        aria-invalid={problem ? true : undefined}
                        aria-describedby={problem ? `${id}-error` : undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NOT_MAPPED}>Not imported</SelectItem>
                        {sheet.columns
                          .filter((column) => !column.sensitive)
                          .map((column) => (
                            <SelectItem key={column.index} value={String(column.index)}>
                              {column.letter} — {column.header || '(no header)'}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {problem && (
                      <p id={`${id}-error`} className="text-sm text-danger-text">
                        {problem}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {sheet?.problem === null && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <DefaultSessionSelect
                value={defaultSession}
                onChange={setDefaultSession}
                required={!columns.academicSessionCode}
                problem={problems.defaultAcademicSessionId}
                disabled={!canRun || busy}
              />
            </div>
            <ValueMapsSection
              sheet={sheet}
              columns={columns}
              valueMaps={valueMaps}
              onChange={setValueMaps}
              problems={problems}
              disabled={!canRun || busy}
            />
            {sheet.columns.some((column) => column.sensitive) && (
              <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-navy-950">
                Not imported:{' '}
                {sheet.columns
                  .filter((column) => column.sensitive)
                  .map((column) => `${column.letter} “${column.header}”`)
                  .join(', ')}{' '}
                — identity numbers are never imported, stored with the rows or shown in previews.
              </p>
            )}
          </>
        )}

        {formError && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">
            {formError}
          </p>
        )}
        {canRun && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void submit()} disabled={busy || sheet?.problem !== null}>
              {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              Save mapping and validate
            </Button>
            {onCancelEdit && (
              <Button variant="ghost" onClick={onCancelEdit} disabled={busy}>
                Keep current validation
              </Button>
            )}
            <span className="text-meta">
              {mappedCount} of {STUDENT_IMPORT_FIELDS.length} fields mapped
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
