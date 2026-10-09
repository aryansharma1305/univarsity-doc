import {
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import {
  AUTHENTICITY_LABELS,
  HISTORICAL_DOCUMENT_TYPE_LABELS,
  type StudentDocument,
} from '@docversity/validation';
import { formatDate } from '@/lib/format';
import { PageIntro, PortalCard, PortalEmptyState } from './portal-ui';

function fileLabel(document: StudentDocument): string {
  const kind = document.contentType === 'application/pdf' ? 'PDF' : 'Image';
  const size =
    document.sizeBytes < 1024 * 1024
      ? `${String(Math.max(1, Math.round(document.sizeBytes / 1024)))} KB`
      : `${(document.sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${kind} · ${size}`;
}

function fileUrl(id: string, disposition: 'inline' | 'attachment') {
  return `/api/v1/student/documents/${id}/file?disposition=${disposition}`;
}

/**
 * One document. Visibility (published by the university) and authenticity (an explicit staff check
 * against records) are shown separately and in plain words — never as "verified" by the portal.
 */
function DocumentCard({ document }: { document: StudentDocument }) {
  const confirmed = document.authenticity === 'CONFIRMED_AGAINST_RECORDS';
  return (
    <article
      aria-label={document.title}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-card"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand">
          <FileTextIcon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold break-words text-navy-950">{document.title}</h2>
          <p className="text-meta">
            {HISTORICAL_DOCUMENT_TYPE_LABELS[document.documentType]} ·{' '}
            <span className="tabular">Ref {document.reference}</span>
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Certificate number</dt>
          <dd className="font-medium break-words text-navy-950">
            {document.certificateNumber ?? 'Not recorded'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Issue date</dt>
          <dd className="font-medium text-navy-950">
            {document.issuedOn ? formatDate(document.issuedOn) : 'Not recorded'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Registration</dt>
          <dd className="font-medium break-words text-navy-950">
            {document.registrationNumber} · {document.program.name}
          </dd>
        </div>
      </dl>
      <div
        className={
          confirmed
            ? 'flex gap-2 rounded-lg bg-info-soft p-3 text-sm text-navy-950'
            : 'flex gap-2 rounded-lg bg-muted/60 p-3 text-sm text-navy-950'
        }
      >
        <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          <span className="font-semibold">{AUTHENTICITY_LABELS[document.authenticity]}.</span>{' '}
          {confirmed
            ? `University staff checked this copy against university records${document.authenticityReviewedAt ? ` on ${formatDate(document.authenticityReviewedAt.slice(0, 10))}` : ''}.`
            : 'This is a copy of a previously issued document held by the university. It has not been separately checked against records.'}
        </p>
      </div>
      {document.available ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <span className="text-meta">{fileLabel(document)}</span>
          <div className="flex flex-wrap gap-2">
            <a
              href={fileUrl(document.id, 'inline')}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Preview ${document.title} (opens in a new tab)`}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-navy-950 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ExternalLinkIcon aria-hidden="true" className="size-4" />
              Preview
            </a>
            <a
              href={fileUrl(document.id, 'attachment')}
              aria-label={`Download ${document.title}`}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <DownloadIcon aria-hidden="true" className="size-4" />
              Download
            </a>
          </div>
        </div>
      ) : (
        <p className="flex gap-2 border-t border-border pt-4 text-sm text-navy-950">
          <ClockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          This document is being prepared for viewing. Please check again later.
        </p>
      )}
    </article>
  );
}

export function StudentDocuments({ documents }: { documents: StudentDocument[] | null }) {
  return (
    <>
      <PageIntro
        title="My Documents"
        description="Certificates and records the university has published to you. You can view and download them; only the university can add or change documents."
      />
      {documents === null ? (
        <PortalCard title="Documents" icon={FileTextIcon}>
          <p role="alert" className="text-sm text-danger-text">
            Your documents could not be loaded right now. Refresh the page to try again.
          </p>
        </PortalCard>
      ) : documents.length === 0 ? (
        <PortalCard title="Documents" icon={FileTextIcon}>
          <PortalEmptyState
            icon={FileTextIcon}
            title="No documents published yet"
            description="When the university publishes a certificate or record to your account, it will appear here. Contact the registrar’s office if you expect a document."
          />
        </PortalCard>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {documents.map((document) => (
            <DocumentCard key={document.id} document={document} />
          ))}
        </div>
      )}
    </>
  );
}
