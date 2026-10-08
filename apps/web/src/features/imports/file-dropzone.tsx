'use client';

import { FileSpreadsheetIcon, UploadCloudIcon, XIcon } from 'lucide-react';
import { type DragEvent, useId, useRef, useState } from 'react';
import { Button } from '@docversity/ui/components/button';
import { cn } from '@docversity/ui/lib/utils';
import { formatBytes } from './labels';

/** Client-side pre-check only; the API re-checks everything (type, size, structure). */
export const MAX_UPLOAD_MB = 10;

export function checkWorkbookFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return 'Choose an Excel workbook (.xlsx). Older .xls files must be saved as .xlsx first.';
  }
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `This file is larger than ${MAX_UPLOAD_MB} MB. Split it into smaller files.`;
  }
  return null;
}

/**
 * Drag-and-drop area plus a normal file input. The visible button opens the native picker, so
 * keyboard and screen-reader users select files the usual way. The chosen file's name, size and
 * type are shown before anything is uploaded.
 */
export function FileDropzone({
  file,
  onFile,
  disabled,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const choose = (next: File | null | undefined) => {
    if (!next) return;
    const issue = checkWorkbookFile(next);
    setProblem(issue);
    onFile(issue ? null : next);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) choose(event.dataTransfer.files[0]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
          dragging ? 'border-brand bg-info-soft' : 'border-border-strong bg-card',
        )}
      >
        <UploadCloudIcon aria-hidden="true" className="size-8 text-brand" />
        <p className="text-sm text-navy-950">Drag an .xlsx file here, or</p>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          // The visible "Choose file" button is the keyboard path; avoid a second tab stop.
          tabIndex={-1}
          aria-label="Workbook file (.xlsx)"
          disabled={disabled}
          aria-describedby={`${inputId}-hint`}
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          Choose file
        </Button>
        <p id={`${inputId}-hint`} className="text-meta">
          Excel workbook (.xlsx), up to {MAX_UPLOAD_MB} MB.
        </p>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-danger-text">
          {problem}
        </p>
      )}
      {file && (
        <div
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
          aria-live="polite"
        >
          <FileSpreadsheetIcon aria-hidden="true" className="size-6 shrink-0 text-success" />
          <dl className="min-w-0 flex-1 text-sm">
            <dt className="sr-only">File name</dt>
            <dd className="truncate font-medium text-navy-950">{file.name}</dd>
            <div className="flex flex-wrap gap-x-3 text-meta">
              <dt className="sr-only">Size</dt>
              <dd>{formatBytes(file.size)}</dd>
              <dt className="sr-only">Type</dt>
              <dd>Excel workbook (.xlsx)</dd>
            </div>
          </dl>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={`Remove ${file.name}`}
            onClick={() => {
              onFile(null);
            }}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
