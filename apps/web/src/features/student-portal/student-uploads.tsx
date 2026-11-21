'use client';

import { useRef, useState } from 'react';
import { z } from 'zod';
import { ExternalLinkIcon, FileUpIcon, IdCardIcon, GraduationCapIcon } from 'lucide-react';
import {
  HISTORICAL_DOCUMENT_RULES,
  STUDENT_UPLOAD_CATEGORY_LABELS,
  STUDENT_UPLOAD_GROUPS,
  type StudentUpload,
  type StudentUploadCategory,
  studentUploadSchema,
} from '@docversity/validation';
import { Button } from '@docversity/ui/components/button';
import { apiUpload, errorMessage, studentRequest } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { PortalCard } from './portal-ui';

const MAX_MB = HISTORICAL_DOCUMENT_RULES.maxBytes / (1024 * 1024);
const ACCEPT = HISTORICAL_DOCUMENT_RULES.acceptedTypes.join(',');

function fileLabel(upload: StudentUpload): string {
  const kind = upload.contentType === 'application/pdf' ? 'PDF' : 'Image';
  const kb = Math.max(1, Math.round(upload.sizeBytes / 1024));
  const size = kb < 1024 ? `${String(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  return `${kind} · ${size} · ${formatDate(upload.uploadedAt.slice(0, 10))}`;
}

function UploadRow({
  category,
  upload,
  onChange,
}: {
  category: StudentUploadCategory;
  upload: StudentUpload | undefined;
  onChange: (category: StudentUploadCategory, upload: StudentUpload | undefined) => void;
}) {
  const label = STUDENT_UPLOAD_CATEGORY_LABELS[category];
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function send(file: File) {
    if (file.size > HISTORICAL_DOCUMENT_RULES.maxBytes) {
      setMessage({ error: true, text: `The file is larger than ${String(MAX_MB)} MB.` });
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const saved = await apiUpload(`student/uploads/${category}`, form, studentUploadSchema, {
        principal: 'student',
      });
      onChange(category, saved);
      setMessage({ error: false, text: upload ? 'File replaced.' : 'File uploaded.' });
    } catch (error) {
      setMessage({ error: true, text: errorMessage(error) });
    } finally {
      setPending(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setPending(true);
    setMessage(null);
    try {
      await studentRequest('DELETE', `student/uploads/${category}`, z.undefined());
      onChange(category, undefined);
      setConfirming(false);
      setMessage({ error: false, text: 'File deleted.' });
    } catch (error) {
      setMessage({ error: true, text: errorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-navy-950">{label}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {upload ? fileLabel(upload) : 'Not uploaded'}
        </p>
        {message && (
          <p
            role={message.error ? 'alert' : 'status'}
            className={
              message.error ? 'mt-1 text-xs text-danger-text' : 'mt-1 text-xs text-success-text'
            }
          >
            {message.text}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
          }}
        />
        {upload && (
          <a
            href={`/api/v1/student/uploads/${category}/file?disposition=inline`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${label} (opens in a new tab)`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-navy-950 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ExternalLinkIcon aria-hidden="true" className="size-4" />
            View
          </a>
        )}
        {confirming ? (
          <>
            <Button
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              aria-label={`Confirm delete ${label}`}
              onClick={() => void remove()}
            >
              {pending ? 'Deleting…' : 'Confirm delete'}
            </Button>
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep file
            </Button>
          </>
        ) : (
          <>
            <Button
              variant={upload ? 'outline' : 'default'}
              className="min-h-11"
              disabled={pending}
              aria-label={`${upload ? 'Replace' : 'Upload'} ${label}`}
              onClick={() => input.current?.click()}
            >
              <FileUpIcon aria-hidden="true" />
              {pending ? 'Uploading…' : upload ? 'Replace' : 'Upload'}
            </Button>
            {upload && (
              <Button
                variant="ghost"
                className="min-h-11 text-danger-text"
                disabled={pending}
                aria-label={`Delete ${label}`}
                onClick={() => {
                  setConfirming(true);
                }}
              >
                Delete
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

const GROUPS = [
  { title: 'Academic', icon: GraduationCapIcon, categories: STUDENT_UPLOAD_GROUPS.ACADEMIC },
  { title: 'Identity', icon: IdCardIcon, categories: STUDENT_UPLOAD_GROUPS.IDENTITY },
] as const;

/** The student's own uploads by category: upload, replace, view and delete (PDF, JPEG or PNG). */
export function StudentUploads({ initial }: { initial: StudentUpload[] | null }) {
  const [uploads, setUploads] = useState(
    () => new Map((initial ?? []).map((upload) => [upload.category, upload])),
  );
  const change = (category: StudentUploadCategory, upload: StudentUpload | undefined) => {
    setUploads((current) => {
      const next = new Map(current);
      if (upload) next.set(category, upload);
      else next.delete(category);
      return next;
    });
  };
  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      {initial === null && (
        <p role="alert" className="text-sm text-danger-text xl:col-span-2">
          Your uploaded files could not be loaded right now. Refresh the page to try again.
        </p>
      )}
      {GROUPS.map(({ title, icon, categories }) => (
        <PortalCard key={title} title={title} icon={icon}>
          <p className="mb-4 text-xs text-muted-foreground">PDF, JPEG or PNG, up to {MAX_MB} MB.</p>
          <ul aria-label={`${title} documents`} className="divide-y divide-border">
            {categories.map((category) => (
              <UploadRow
                key={category}
                category={category}
                upload={uploads.get(category)}
                onChange={change}
              />
            ))}
          </ul>
        </PortalCard>
      ))}
    </div>
  );
}
