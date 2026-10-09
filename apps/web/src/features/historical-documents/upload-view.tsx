'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckIcon, FileUpIcon, SearchIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { cn } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Card, CardContent } from '@docversity/ui/components/card';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import { Textarea } from '@docversity/ui/components/textarea';
import {
  HISTORICAL_DOCUMENT_RULES,
  type Registration,
  registrationListSchema,
  registrationSchema,
  type UploadHistoricalDocumentInput,
  uploadHistoricalDocumentSchema,
} from '@docversity/validation';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState } from '@/components/data/states';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useCan } from '@/components/providers/session-context';
import { apiRequest } from '@/lib/api';
import { documentForm, documentsApi, useDocumentMutation } from './api';
import { PROVENANCE_OPTIONS, TYPE_OPTIONS, fileSize } from './labels';

const MAX_MB = HISTORICAL_DOCUMENT_RULES.maxBytes / (1024 * 1024);
const ACCEPT = HISTORICAL_DOCUMENT_RULES.acceptedTypes.join(',');

/** Client-side pre-check only; the API inspects the content again. */
export function checkDocumentFile(file: File): string | null {
  const accepted: readonly string[] = HISTORICAL_DOCUMENT_RULES.acceptedTypes;
  if (!accepted.includes(file.type)) return 'Choose a PDF, JPEG or PNG file.';
  if (file.size > HISTORICAL_DOCUMENT_RULES.maxBytes) {
    return `Choose a file under ${String(MAX_MB)} MB.`;
  }
  return null;
}

function RegistrationPicker({
  selected,
  onSelect,
  error,
}: {
  selected: Registration | null;
  onSelect: (registration: Registration) => void;
  error?: string;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['registrations', 'picker', search],
    queryFn: () =>
      apiRequest('GET', 'registrations', registrationListSchema, {
        query: { search, pageSize: 8 },
      }),
    enabled: search.trim().length >= 2,
  });
  const results = query.data?.data ?? [];
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-search`} className="text-label">
        Student registration{' '}
        <span aria-hidden="true" className="text-danger-text">
          *
        </span>
      </Label>
      {selected && (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm text-navy-950">
          Selected: <strong className="tabular">{selected.registrationNumber}</strong> —{' '}
          {selected.studentName} · {selected.program.code}
        </p>
      )}
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={`${id}-search`}
          value={search}
          className="h-10 pl-9"
          placeholder="Registration number or student name (at least 2 characters)"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>
      {search.trim().length >= 2 && (
        <ul
          aria-label="Matching registrations"
          className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1"
        >
          {query.isPending ? (
            <li className="p-2 text-sm text-muted-foreground">Searching…</li>
          ) : results.length === 0 ? (
            <li className="p-2 text-sm text-muted-foreground">No registration matches.</li>
          ) : (
            results.map((registration) => {
              const active = selected?.id === registration.id;
              return (
                <li key={registration.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      onSelect(registration);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded px-2 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      active && 'bg-secondary',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong',
                        active && 'border-brand bg-brand text-white',
                      )}
                    >
                      {active && <CheckIcon aria-hidden="true" className="size-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium text-navy-950 tabular">
                        {registration.registrationNumber}
                      </span>{' '}
                      <span className="break-words">{registration.studentName}</span>
                      <span className="block text-xs text-foreground/80">
                        {registration.program.code} · {registration.academicSession.code}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

export function UploadDocumentView() {
  const canUpload = useCan(PERMISSIONS.historicalDocumentsUpload);
  const router = useRouter();
  const params = useSearchParams();
  const preselected = params.get('registration');
  const [selected, setSelected] = useState<Registration | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileId = useId();
  const form = useForm<UploadHistoricalDocumentInput>({
    resolver: zodResolver(uploadHistoricalDocumentSchema),
    defaultValues: {
      studentRegistrationId: preselected ?? '',
      documentType: 'DEGREE_CERTIFICATE',
      title: '',
      certificateNumber: '',
      issuedOn: '',
      provenance: 'UNIVERSITY_ARCHIVE',
      provenanceNote: '',
      legacySourceSystem: '',
      legacyRecordId: '',
      legacyVerificationUrl: '',
    },
  });
  // Opened from a student record (?registration=…): preselect that registration.
  const preselectedQuery = useQuery({
    queryKey: ['registrations', 'detail', preselected],
    queryFn: () => apiRequest('GET', `registrations/${preselected ?? ''}`, registrationSchema),
    enabled: Boolean(preselected),
  });
  const registration = selected ?? preselectedQuery.data ?? null;
  const upload = useDocumentMutation((body: FormData) => documentsApi.upload(body));

  if (!canUpload) {
    return (
      <EmptyState
        title="You don’t have access to this"
        description="Uploading historical documents needs the upload permission."
      />
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!file) {
      setFileError('Choose the scanned document to upload.');
      return;
    }
    try {
      const parsed = uploadHistoricalDocumentSchema.parse(values);
      const saved = await upload.mutateAsync(
        documentForm(
          {
            ...parsed,
            issuedOn: parsed.issuedOn ?? undefined,
            certificateNumber: parsed.certificateNumber ?? undefined,
            legacyVerificationUrl: parsed.legacyVerificationUrl ?? undefined,
            provenanceNote: parsed.provenanceNote ?? undefined,
            legacySourceSystem: parsed.legacySourceSystem ?? undefined,
            legacyRecordId: parsed.legacyRecordId ?? undefined,
          },
          file,
        ),
      );
      toast.success('Uploaded as a draft. It is not visible to the student until published.');
      router.push(`/admin/historical-documents/${saved.id}`);
    } catch (error) {
      applyServerErrors(error, form.setError);
      const fileDetail =
        error && typeof error === 'object' && 'details' in error
          ? (error as { details: { path: string; message: string }[] }).details.find(
              (d) => d.path === 'file',
            )
          : undefined;
      if (fileDetail) setFileError(fileDetail.message);
    }
  });

  return (
    <>
      <PageHeader
        title="Upload historical document"
        description="Saved as a private draft linked to one registration. Publish it from the document page when it is ready for the student."
      />
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-5">
        <Card className="gap-0 py-0 shadow-card">
          <CardContent className="flex flex-col gap-4 p-5">
            <h2 className="text-section-title text-navy-950">1. Student</h2>
            <RegistrationPicker
              selected={registration}
              error={form.formState.errors.studentRegistrationId?.message}
              onSelect={(chosen) => {
                setSelected(chosen);
                form.setValue('studentRegistrationId', chosen.id, { shouldValidate: true });
              }}
            />
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 shadow-card">
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <h2 className="text-section-title text-navy-950 sm:col-span-2">2. Document</h2>
            <SelectField
              control={form.control}
              name="documentType"
              label="Document type"
              options={TYPE_OPTIONS}
              required
            />
            <Field
              control={form.control}
              name="title"
              label="Title"
              required
              hint="As printed, e.g. Bachelor of Science degree"
            >
              {(aria) => <Input {...aria} {...form.register('title')} />}
            </Field>
            <Field
              control={form.control}
              name="certificateNumber"
              label="Certificate number"
              hint="Exactly as printed, if known"
            >
              {(aria) => (
                <Input {...aria} autoComplete="off" {...form.register('certificateNumber')} />
              )}
            </Field>
            <Field control={form.control} name="issuedOn" label="Issue date" hint="If known">
              {(aria) => <Input {...aria} type="date" {...form.register('issuedOn')} />}
            </Field>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={fileId} className="text-label">
                File{' '}
                <span aria-hidden="true" className="text-danger-text">
                  *
                </span>
              </Label>
              <Input
                id={fileId}
                type="file"
                accept={ACCEPT}
                className="h-10 file:mr-3 file:font-medium file:text-brand"
                aria-invalid={Boolean(fileError)}
                aria-describedby={`${fileId}-hint${fileError ? ` ${fileId}-error` : ''}`}
                onChange={(event) => {
                  const chosen = event.target.files?.[0] ?? null;
                  const problem = chosen ? checkDocumentFile(chosen) : null;
                  setFileError(problem);
                  setFile(problem ? null : chosen);
                }}
              />
              <p id={`${fileId}-hint`} className="text-xs text-muted-foreground">
                PDF, JPEG or PNG up to {MAX_MB} MB. The original file is kept unchanged; PDFs with
                scripts, attachments or forms are refused.
              </p>
              {file && (
                <p className="flex items-center gap-2 text-sm text-navy-950">
                  <FileUpIcon aria-hidden="true" className="size-4" />
                  {file.name} · {fileSize(file.size)}
                </p>
              )}
              {fileError && (
                <p
                  id={`${fileId}-error`}
                  role="alert"
                  className="text-xs font-medium text-danger-text"
                >
                  {fileError}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 shadow-card">
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 className="text-section-title text-navy-950">3. Provenance</h2>
              <p className="text-sm text-muted-foreground">
                Where this copy came from. Legacy identifiers are stored exactly as given and are
                never rewritten.
              </p>
            </div>
            <SelectField
              control={form.control}
              name="provenance"
              label="Source"
              options={PROVENANCE_OPTIONS}
              required
            />
            <Field
              control={form.control}
              name="legacySourceSystem"
              label="Legacy system"
              hint="e.g. WORDPRESS"
            >
              {(aria) => (
                <Input {...aria} autoComplete="off" {...form.register('legacySourceSystem')} />
              )}
            </Field>
            <Field control={form.control} name="legacyRecordId" label="Legacy record ID">
              {(aria) => (
                <Input {...aria} autoComplete="off" {...form.register('legacyRecordId')} />
              )}
            </Field>
            <Field
              control={form.control}
              name="legacyVerificationUrl"
              label="Printed verification URL"
              hint="From the original’s QR code; stored for reference only"
            >
              {(aria) => (
                <Input
                  {...aria}
                  type="url"
                  autoComplete="off"
                  {...form.register('legacyVerificationUrl')}
                />
              )}
            </Field>
            <Field
              control={form.control}
              name="provenanceNote"
              label="Provenance note"
              className="sm:col-span-2"
            >
              {(aria) => (
                <Textarea
                  {...aria}
                  maxLength={1000}
                  placeholder="e.g. Scanned from the 2019 convocation register, box 4."
                  {...form.register('provenanceNote')}
                />
              )}
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild variant="outline">
            <Link href="/admin/historical-documents">Cancel</Link>
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Uploading…' : 'Upload as draft'}
          </Button>
        </div>
      </form>
    </>
  );
}
