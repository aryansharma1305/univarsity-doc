'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  AlertTriangleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  FilePenLineIcon,
  RefreshCwIcon,
  SendIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { useState } from 'react';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { Card, CardContent } from '@docversity/ui/components/card';
import { Skeleton } from '@docversity/ui/components/skeleton';
import {
  HISTORICAL_DOCUMENT_TYPE_LABELS,
  type HistoricalDocumentDetail,
  PROVENANCE_LABELS,
} from '@docversity/validation';
import { useSetBreadcrumbLabel } from '@/components/admin/breadcrumb-context';
import { ErrorState } from '@/components/data/states';
import { useCan, useSessionUser } from '@/components/providers/session-context';
import { formatDate, formatDateTime } from '@/lib/format';
import { documentFileUrl, useHistoricalDocument } from './api';
import {
  AuthenticityDialog,
  EditDraftDialog,
  PublishDialog,
  ReplaceDialog,
  WithdrawDialog,
} from './document-dialogs';
import { AuthenticityBadge, DocumentStatusBadge } from './documents-view';
import { fileKind, fileSize } from './labels';

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-meta">{label}</dt>
      <dd
        className={`text-sm break-words text-navy-950 ${mono ? 'font-mono text-xs break-all' : ''}`}
      >
        {value && value.length > 0 ? value : '—'}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-0 py-0 shadow-card">
      <CardContent className="flex flex-col gap-4 p-5">
        <h2 className="text-section-title text-navy-950">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

function Preview({ document }: { document: HistoricalDocumentDetail }) {
  const [failed, setFailed] = useState(false);
  const isImage = document.file.contentType !== 'application/pdf';
  return (
    <div className="flex flex-col gap-3">
      {isImage && !failed ? (
        <Image
          src={documentFileUrl(document.id, 'inline')}
          alt={`Scan: ${document.title}`}
          width={600}
          height={800}
          unoptimized
          className="h-auto max-h-[32rem] w-full max-w-md rounded-lg border border-border bg-muted object-contain"
          onError={() => {
            setFailed(true);
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {failed
            ? 'The preview could not be loaded.'
            : 'PDF documents open in a new tab for preview.'}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a
            href={documentFileUrl(document.id, 'inline')}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLinkIcon aria-hidden="true" />
            Open preview
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={documentFileUrl(document.id, 'attachment')}>
            <DownloadIcon aria-hidden="true" />
            Download original
          </a>
        </Button>
      </div>
    </div>
  );
}

type DialogKind = 'edit' | 'publish' | 'withdraw' | 'replace' | 'review' | null;

export function DocumentDetailView({ documentId }: { documentId: string }) {
  const query = useHistoricalDocument(documentId);
  const user = useSessionUser();
  const canUpload = useCan(PERMISSIONS.historicalDocumentsUpload);
  const canPublish = useCan(PERMISSIONS.historicalDocumentsPublish);
  const canVerify = useCan(PERMISSIONS.historicalDocumentsVerify);
  const [dialog, setDialog] = useState<DialogKind>(null);
  useSetBreadcrumbLabel(query.data ? query.data.title : null);

  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const doc = query.data;
  const isUploader = doc.uploadedBy?.id === user.id;
  const blockedByReplacement = doc.replacedBy !== null;
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-0 py-0 shadow-card">
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-meta">{HISTORICAL_DOCUMENT_TYPE_LABELS[doc.documentType]}</p>
              <h1 className="text-page-title break-words text-navy-950">{doc.title}</h1>
              <p className="mt-1 text-sm break-words">
                <Link
                  href={`/admin/students/${doc.student.id}`}
                  className="font-medium text-brand hover:underline"
                >
                  {doc.student.fullName}
                </Link>{' '}
                · <span className="tabular">{doc.registration.registrationNumber}</span> ·{' '}
                {doc.registration.program.code}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <DocumentStatusBadge status={doc.status} />
                <AuthenticityBadge authenticity={doc.authenticity} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {doc.status === 'DRAFT' && canUpload && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialog('edit');
                  }}
                >
                  <FilePenLineIcon aria-hidden="true" />
                  Edit draft
                </Button>
              )}
              {(doc.status === 'PUBLISHED' || doc.status === 'WITHDRAWN') &&
                canUpload &&
                !blockedByReplacement && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDialog('replace');
                    }}
                  >
                    <RefreshCwIcon aria-hidden="true" />
                    Replace
                  </Button>
                )}
              {(doc.status === 'DRAFT' || doc.status === 'PUBLISHED') && canPublish && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialog('withdraw');
                  }}
                >
                  <EyeOffIcon aria-hidden="true" />
                  Withdraw
                </Button>
              )}
              {doc.status !== 'SUPERSEDED' && canVerify && (
                <Button
                  variant="outline"
                  disabled={isUploader}
                  title={isUploader ? 'The uploader cannot review authenticity' : undefined}
                  onClick={() => {
                    setDialog('review');
                  }}
                >
                  <ShieldCheckIcon aria-hidden="true" />
                  Review authenticity
                </Button>
              )}
              {(doc.status === 'DRAFT' || doc.status === 'WITHDRAWN') &&
                canPublish &&
                !blockedByReplacement && (
                  <Button
                    onClick={() => {
                      setDialog('publish');
                    }}
                  >
                    <SendIcon aria-hidden="true" />
                    {doc.status === 'WITHDRAWN' ? 'Publish again' : 'Publish to student'}
                  </Button>
                )}
            </div>
          </div>
          {canVerify && isUploader && doc.status !== 'SUPERSEDED' && (
            <p className="text-sm text-foreground/80">
              You uploaded this document, so another authorised reviewer must record its
              authenticity.
            </p>
          )}
          {doc.sameNumberElsewhere.length > 0 && (
            <div
              role="alert"
              className="flex gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-navy-950"
            >
              <AlertTriangleIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-warning-text"
              />
              <div>
                <p className="font-semibold">
                  The same certificate number is on another registration
                </p>
                <ul className="mt-1">
                  {doc.sameNumberElsewhere.map((other) => (
                    <li key={other.id}>
                      <Link
                        href={`/admin/historical-documents/${other.id}`}
                        className="text-brand hover:underline"
                      >
                        {other.registrationNumber}
                      </Link>{' '}
                      ({other.status.toLowerCase()})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Student visibility">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Status" value={doc.status.toLowerCase()} />
            <Detail
              label="Published"
              value={
                doc.publishedAt
                  ? `${formatDateTime(doc.publishedAt)}${doc.publishedBy ? ` by ${doc.publishedBy.displayName}` : ''}`
                  : 'Not published'
              }
            />
            {doc.withdrawnAt && (
              <>
                <Detail
                  label="Withdrawn"
                  value={`${formatDateTime(doc.withdrawnAt)}${doc.withdrawnBy ? ` by ${doc.withdrawnBy.displayName}` : ''}`}
                />
                <Detail label="Withdrawal reason" value={doc.withdrawalReason} />
              </>
            )}
            {doc.supersededAt && (
              <Detail label="Superseded" value={formatDateTime(doc.supersededAt)} />
            )}
          </dl>
          <p className="text-xs text-foreground/80">
            Students see only published documents. Publishing makes a document visible; it does not
            confirm authenticity.
          </p>
        </Section>
        <Section title="Official authenticity">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail
              label="Outcome"
              value={
                doc.authenticity === 'UNVERIFIED'
                  ? 'Not independently verified'
                  : doc.authenticity === 'DISPUTED'
                    ? 'Disputed'
                    : 'Confirmed against university records'
              }
            />
            <Detail
              label="Reviewed"
              value={
                doc.authenticityReviewedAt
                  ? `${formatDateTime(doc.authenticityReviewedAt)}${doc.authenticityReviewedBy ? ` by ${doc.authenticityReviewedBy.displayName}` : ''}`
                  : 'Not reviewed'
              }
            />
            {doc.authenticityNote && (
              <Detail label="What was checked" value={doc.authenticityNote} />
            )}
          </dl>
          <p className="text-xs text-foreground/80">
            A staff check against university records — never a cryptographic or public verification.
          </p>
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Document">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Certificate number" value={doc.certificateNumber ?? 'Not known'} />
            <Detail
              label="Issue date"
              value={doc.issuedOn ? formatDate(doc.issuedOn) : 'Not known'}
            />
            <Detail
              label="File"
              value={`${fileKind(doc.file.contentType)} · ${fileSize(doc.file.sizeBytes)}`}
            />
            <Detail label="Uploaded file name" value={doc.file.originalFilename} />
            <Detail
              label="Uploaded"
              value={`${formatDateTime(doc.createdAt)}${doc.uploadedBy ? ` by ${doc.uploadedBy.displayName}` : ''}`}
            />
            <Detail label="SHA-256" value={doc.file.sha256} mono />
          </dl>
          <Preview document={doc} />
        </Section>
        <Section title="Provenance">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Source" value={PROVENANCE_LABELS[doc.provenance]} />
            <Detail label="Legacy system" value={doc.legacySourceSystem} />
            <Detail label="Legacy record ID" value={doc.legacyRecordId} mono />
            <Detail
              label="Printed verification URL (reference only)"
              value={doc.legacyVerificationUrl}
              mono
            />
            {doc.provenanceNote && <Detail label="Note" value={doc.provenanceNote} />}
          </dl>
          {(doc.replaces ?? doc.replacedBy) && (
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
              {doc.replaces && (
                <p>
                  Replaces{' '}
                  <Link
                    href={`/admin/historical-documents/${doc.replaces.id}`}
                    className="text-brand hover:underline"
                  >
                    {doc.replaces.title}
                  </Link>{' '}
                  ({doc.replaces.status.toLowerCase()})
                </p>
              )}
              {doc.replacedBy && (
                <p>
                  Replaced by{' '}
                  <Link
                    href={`/admin/historical-documents/${doc.replacedBy.id}`}
                    className="text-brand hover:underline"
                  >
                    {doc.replacedBy.title}
                  </Link>{' '}
                  ({doc.replacedBy.status.toLowerCase()})
                </p>
              )}
            </div>
          )}
        </Section>
      </div>

      <Section title="History">
        <ol className="divide-y divide-border rounded-lg border border-border">
          {doc.history.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-4"
            >
              <span className="text-sm text-navy-950">{item.summary}</span>
              <span className="text-meta shrink-0">
                {item.actor ?? 'System'} · {formatDateTime(item.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <EditDraftDialog document={doc} open={dialog === 'edit'} onOpenChange={close} />
      <PublishDialog document={doc} open={dialog === 'publish'} onOpenChange={close} />
      <WithdrawDialog document={doc} open={dialog === 'withdraw'} onOpenChange={close} />
      <ReplaceDialog document={doc} open={dialog === 'replace'} onOpenChange={close} />
      <AuthenticityDialog document={doc} open={dialog === 'review'} onOpenChange={close} />
    </div>
  );
}
