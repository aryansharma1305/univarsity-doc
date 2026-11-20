'use client';

import { useQuery } from '@tanstack/react-query';
import { DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import {
  STUDENT_UPLOAD_CATEGORIES,
  STUDENT_UPLOAD_CATEGORY_LABELS,
  studentUploadListSchema,
} from '@docversity/validation';
import { Skeleton } from '@docversity/ui/components/skeleton';
import { ErrorState } from '@/components/data/states';
import { apiRequest } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const linkClass =
  'inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-brand hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * Student uploads (read-only for staff with `studentUploads.read`). Loaded only while the tab is
 * open: the API audits every list view and every file view/download.
 */
export function StudentUploadsPanel({ studentId, active }: { studentId: string; active: boolean }) {
  const query = useQuery({
    queryKey: ['students', 'uploads', studentId],
    queryFn: () => apiRequest('GET', `students/${studentId}/uploads`, studentUploadListSchema),
    enabled: active,
    staleTime: 0,
  });
  if (query.isPending) return <Skeleton className="h-40 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const byCategory = new Map(query.data.data.map((upload) => [upload.category, upload]));
  const file = (id: string, disposition: 'inline' | 'attachment') =>
    `/api/v1/students/${studentId}/uploads/${id}/file?disposition=${disposition}`;
  return (
    <section
      aria-labelledby="student-uploads-heading"
      className="rounded-lg border border-border bg-card shadow-card"
    >
      <h2 id="student-uploads-heading" className="px-4 pt-4 text-section-title text-navy-950">
        Student uploads
      </h2>
      <ul className="divide-y divide-border">
        {STUDENT_UPLOAD_CATEGORIES.map((category) => {
          const upload = byCategory.get(category);
          const label = STUDENT_UPLOAD_CATEGORY_LABELS[category];
          return (
            <li
              key={category}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-meta">
                  {upload
                    ? `${upload.contentType === 'application/pdf' ? 'PDF' : 'Image'} · uploaded ${formatDateTime(upload.uploadedAt)}`
                    : 'Not uploaded'}
                </p>
              </div>
              {upload && (
                <div className="flex flex-wrap gap-2">
                  <a
                    href={file(upload.id, 'inline')}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${label} (opens in a new tab)`}
                    className={linkClass}
                  >
                    <ExternalLinkIcon aria-hidden="true" className="size-4" />
                    View
                  </a>
                  <a
                    href={file(upload.id, 'attachment')}
                    aria-label={`Download ${label}`}
                    className={linkClass}
                  >
                    <DownloadIcon aria-hidden="true" className="size-4" />
                    Download
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
