'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { UploadIcon } from 'lucide-react';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import {
  type DocumentAuthenticity,
  HISTORICAL_DOCUMENT_TYPE_LABELS,
  type HistoricalDocumentRow,
  type HistoricalDocumentStatus,
  type HistoricalDocumentType,
} from '@docversity/validation';
import { DataTable } from '@/components/data/data-table';
import { FilterSelect } from '@/components/data/filter-select';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { SearchInput } from '@/components/data/search-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { useListParams } from '@/hooks/use-list-params';
import { formatDate, formatDateTime } from '@/lib/format';
import { useHistoricalDocuments } from './api';
import { AUTHENTICITY, AUTHENTICITY_OPTIONS, STATUS, STATUS_OPTIONS, TYPE_OPTIONS } from './labels';

export function DocumentStatusBadge({ status }: { status: HistoricalDocumentStatus }) {
  return <StatusBadge tone={STATUS[status].tone}>{STATUS[status].label}</StatusBadge>;
}

export function AuthenticityBadge({ authenticity }: { authenticity: DocumentAuthenticity }) {
  return (
    <StatusBadge tone={AUTHENTICITY[authenticity].tone}>
      {AUTHENTICITY[authenticity].label}
    </StatusBadge>
  );
}

export function HistoricalDocumentsView() {
  const canUpload = useCan(PERMISSIONS.historicalDocumentsUpload);
  const { values, page, update } = useListParams(['status', 'type', 'authenticity'] as const);
  const query = useHistoricalDocuments({
    page,
    search: values.search || undefined,
    status: (values.status || undefined) as HistoricalDocumentStatus | undefined,
    documentType: (values.type || undefined) as HistoricalDocumentType | undefined,
    authenticity: (values.authenticity || undefined) as DocumentAuthenticity | undefined,
    sortOrder: 'desc',
  });

  const columns: ColumnDef<HistoricalDocumentRow>[] = [
    {
      header: 'Document',
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            href={`/admin/historical-documents/${row.original.id}`}
            className="font-medium break-words text-brand hover:underline"
          >
            {row.original.title}
          </Link>
          <p className="text-meta">
            {HISTORICAL_DOCUMENT_TYPE_LABELS[row.original.documentType]}
            {row.original.certificateNumber ? ` · No. ${row.original.certificateNumber}` : ''}
          </p>
          <p className="text-meta">
            <span className="tabular">{row.original.reference}</span>
            {row.original.isReplacement ? ' · Replacement' : ''}
          </p>
        </div>
      ),
    },
    {
      header: 'Student',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="break-words">{row.original.student.fullName}</p>
          <p className="text-meta tabular">{row.original.registration.registrationNumber}</p>
        </div>
      ),
    },
    {
      header: 'Issued',
      cell: ({ row }) =>
        row.original.issuedOn ? (
          formatDate(row.original.issuedOn)
        ) : (
          <span className="text-meta">Unknown</span>
        ),
    },
    {
      header: 'Visibility',
      cell: ({ row }) => <DocumentStatusBadge status={row.original.status} />,
    },
    {
      header: 'Authenticity',
      cell: ({ row }) => <AuthenticityBadge authenticity={row.original.authenticity} />,
    },
    {
      header: 'Uploaded',
      cell: ({ row }) => (
        <span className="text-meta">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
  ];

  const filtered = Boolean(values.search || values.status || values.type || values.authenticity);

  return (
    <>
      <PageHeader
        title="Historical Certificates"
        description="Previously issued certificates and marksheets uploaded by staff. Students see a document only after it is published; publication is not an authenticity check."
        actions={
          canUpload && (
            <Button asChild>
              <Link href="/admin/historical-documents/new">
                <UploadIcon aria-hidden="true" />
                Upload document
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SearchInput
          label="Search documents"
          placeholder="Title, certificate number, student or registration number"
          value={values.search}
          onChange={(search) => {
            update({ search });
          }}
        />
        <FilterSelect
          label="Visibility"
          allLabel="All statuses"
          value={values.status}
          onChange={(status) => {
            update({ status });
          }}
          options={STATUS_OPTIONS}
        />
        <FilterSelect
          label="Type"
          allLabel="All types"
          value={values.type}
          onChange={(type) => {
            update({ type });
          }}
          options={TYPE_OPTIONS}
        />
        <FilterSelect
          label="Authenticity"
          allLabel="Any authenticity"
          value={values.authenticity}
          onChange={(authenticity) => {
            update({ authenticity });
          }}
          options={AUTHENTICITY_OPTIONS}
        />
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title={filtered ? 'No documents match these filters' : 'No historical documents yet'}
          description={
            filtered
              ? 'Try a different search or filter.'
              : 'Uploaded certificates and marksheets appear here, linked to their student registration.'
          }
          action={
            !filtered && canUpload ? (
              <Button asChild>
                <Link href="/admin/historical-documents/new">Upload document</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            caption="Historical documents"
            columns={columns}
            data={query.data.data}
            getRowId={(row) => row.id}
            renderCard={(doc) => (
              <div className="flex flex-col gap-2">
                <Link
                  href={`/admin/historical-documents/${doc.id}`}
                  className="font-medium break-words text-brand hover:underline"
                >
                  {doc.title}
                </Link>
                <p className="text-sm break-words">
                  {doc.student.fullName} ·{' '}
                  <span className="tabular">{doc.registration.registrationNumber}</span>
                </p>
                <p className="text-meta">
                  {HISTORICAL_DOCUMENT_TYPE_LABELS[doc.documentType]}
                  {doc.issuedOn ? ` · Issued ${formatDate(doc.issuedOn)}` : ''}
                </p>
                <p className="text-meta">
                  <span className="tabular">{doc.reference}</span>
                  {doc.certificateNumber ? ` · No. ${doc.certificateNumber}` : ''}
                  {doc.isReplacement ? ' · Replacement' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <DocumentStatusBadge status={doc.status} />
                  <AuthenticityBadge authenticity={doc.authenticity} />
                </div>
              </div>
            )}
          />
          <Pagination
            meta={query.data.meta}
            onPageChange={(next) => {
              update({ page: next });
            }}
          />
        </>
      )}
    </>
  );
}
