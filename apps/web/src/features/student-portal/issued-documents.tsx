'use client';

import { useState } from 'react';
import type { z } from 'zod';
import type { studentIssuedDocumentsSchema } from '@docversity/validation';
import { VerificationQRCode } from '@/features/public-verification/verification-result';
export function IssuedDocuments({
  documents,
}: {
  documents: z.infer<typeof studentIssuedDocumentsSchema> | null;
}) {
  const [shown, setShown] = useState<string | null>(null);
  if (!documents?.length) return null;
  return (
    <section
      className="mb-6 rounded-xl border border-border bg-card p-5 sm:p-6"
      aria-label="Official issued documents"
    >
      <h2 className="text-card-title">Official issued documents</h2>
      <ul className="mt-4 divide-y divide-border">
        {documents.map((d) => (
          <li
            key={d.id}
            className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 w-full flex-1">
              <p className="font-medium">{d.documentType.replaceAll('_', ' ')}</p>
              <p className="mt-1 text-sm break-all text-muted-foreground">
                {d.certificateNumber} · Issued {d.issueDate}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-brand hover:bg-secondary focus-visible:outline-2 focus-visible:outline-brand"
                href={`/api/v1/student/official-documents/${d.id}/download`}
              >
                Download issued document
              </a>
              {d.verificationUrl && (
                <button
                  type="button"
                  aria-expanded={shown === d.id}
                  aria-controls={`qr-${d.id}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium text-brand hover:bg-secondary focus-visible:outline-2 focus-visible:outline-brand"
                  onClick={() => {
                    setShown(shown === d.id ? null : d.id);
                  }}
                >
                  {shown === d.id ? 'Hide verification QR' : 'Show verification QR'}
                </button>
              )}
            </div>
            {d.verificationUrl && shown === d.id && (
              <div id={`qr-${d.id}`} className="w-full">
                <VerificationQRCode
                  url={d.verificationUrl}
                  caption="Anyone who scans this code can check this document. Share it only with people who should verify it."
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
