'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { cn } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { prepareOfficialDocumentSchema, type Registration } from '@docversity/validation';
import { ErrorState } from '@/components/data/states';
import { ApiError } from '@/lib/api';
import { useCan } from '@/components/providers/session-context';
import { PERMISSIONS } from '@docversity/types';
import { programsApi } from '@/features/programs/api';
import { studentsApi } from '@/features/students/api';
import { officialApi as api } from './api';

export const ADMISSION_STEPS = [
  'Select Student',
  'Confirm Letter Details',
  'Generate or Upload PDF',
  'Review and Approve',
  'Issue and Verify',
] as const;

/** Step tracker: completed steps are ticked, the current one is marked for assistive technology. */
export function StepTracker({ current }: { current: number }) {
  return (
    <ol aria-label="Admission letter steps" className="grid gap-2 sm:grid-cols-5">
      {ADMISSION_STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={step}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              active && 'border-brand bg-brand/5 font-semibold text-navy-950',
              done && 'border-success-border text-success-text',
              !active && !done && 'border-border text-muted-foreground',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full border text-xs',
                done && 'border-transparent bg-success text-white',
                active && 'border-brand text-brand',
              )}
            >
              {done ? <CheckIcon className="size-3.5" /> : index + 1}
            </span>
            {step}
            {done && <span className="sr-only">(done)</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Row({ label, value, action }: { label: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-2.5 last:border-0 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center gap-x-3 text-sm font-medium text-navy-950">
        {value}
        {action}
      </dd>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** Field-level reasons (e.g. missing nationality, used letter number) instead of a generic error. */
function Problem({ error }: { error: unknown }) {
  const details = error instanceof ApiError ? error.details.map((d) => d.message) : [];
  if (!details.length) return <ErrorState error={error} />;
  return (
    <ul role="alert" className="mt-3 list-disc pl-5 text-sm text-danger-text">
      {details.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

/**
 * Steps 1–3 of issuing an admission letter, ending in "Submit for Approval" (the existing
 * prepare → independent approval → issue workflow). Values printed on a generated letter come
 * from the records on the server, never from this form.
 */
export function AdmissionLetterIssue({
  onPrepared,
  onStep,
}: {
  onPrepared: (id: string) => void;
  /** 0 select student · 1 confirm details · 2 PDF ready to submit. */
  onStep: (step: number) => void;
}) {
  const canPrepare = useCan(PERMISSIONS.certificatesGenerate);
  const client = useQueryClient();
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [registration, setRegistration] = useState<Registration | null>(null);
  const registrations = useQuery({
    queryKey: ['official', 'registrations', search],
    queryFn: () => api.registrations(search, 1),
    enabled: search.length >= 2 && canPrepare,
  });
  if (!canPrepare)
    return (
      <p className="rounded-xl border border-border bg-card p-5 text-sm">
        Your role can view admission letters but cannot prepare them. A staff member with
        certificate preparation access prepares the letter; another approves and issues it.
      </p>
    );
  return (
    <section
      aria-labelledby="select-student"
      className="rounded-xl border border-border bg-card p-5"
    >
      <h3 id="select-student" className="font-semibold text-navy-950">
        1. Select Student
      </h3>
      <form
        className="mt-3 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(term.trim());
          setRegistration(null);
        }}
      >
        <Input
          aria-label="Registration number or student name"
          placeholder="Registration number or student name"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
          }}
          minLength={2}
          maxLength={64}
          required
          className="min-h-11 sm:max-w-md"
        />
        <Button type="submit" variant="outline" className="min-h-11">
          Select Student
        </Button>
      </form>
      {registrations.isError && <ErrorState error={registrations.error} />}
      {registrations.isFetching && (
        <p role="status" className="mt-3 text-sm">
          Searching…
        </p>
      )}
      {registrations.data && !registration && (
        <ul className="mt-3 divide-y rounded-lg border border-border">
          {registrations.data.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm">
                <span className="font-medium text-navy-950">{r.studentName}</span> ·{' '}
                {r.registrationNumber} · {r.program.name}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10"
                aria-label={`Select ${r.studentName}, ${r.registrationNumber}`}
                onClick={() => {
                  setRegistration(r);
                  onStep(1);
                }}
              >
                Select
              </Button>
            </li>
          ))}
          {!registrations.data.data.length && (
            <li className="px-4 py-3 text-sm">No registration matches this search.</li>
          )}
        </ul>
      )}
      {registration && (
        <LetterDetails
          key={registration.id}
          registration={registration}
          onChange={() => {
            setRegistration(null);
            onStep(0);
          }}
          onPreviewed={() => {
            onStep(2);
          }}
          onPrepared={(id) => {
            void client.invalidateQueries({ queryKey: ['official'] });
            setRegistration(null);
            setTerm('');
            setSearch('');
            onPrepared(id);
          }}
        />
      )}
    </section>
  );
}

function LetterDetails({
  registration,
  onChange,
  onPreviewed,
  onPrepared,
}: {
  registration: Registration;
  onChange: () => void;
  onPreviewed: () => void;
  onPrepared: (id: string) => void;
}) {
  const formId = useId();
  const canReadStudent = useCan(PERMISSIONS.studentsRead);
  const canEditStudent = useCan(PERMISSIONS.studentsWrite);
  const canReadProgram = useCan(PERMISSIONS.programsRead);
  const student = useQuery({
    queryKey: ['students', 'detail', registration.studentId],
    queryFn: () => studentsApi.get(registration.studentId),
    enabled: canReadStudent,
  });
  const program = useQuery({
    queryKey: ['programs', 'detail', registration.program.id],
    queryFn: () => programsApi.get(registration.program.id),
    enabled: canReadProgram,
  });
  const policies = useQuery({
    queryKey: ['official', 'policies', registration.program.id, 'ADMISSION_LETTER'],
    queryFn: () =>
      api.policies({
        pageSize: 100,
        status: 'APPROVED',
        programId: registration.program.id,
        service: 'admission-letter',
      }),
  });
  const templates = useQuery({
    queryKey: ['official', 'templates', registration.program.id, 'ADMISSION_LETTER'],
    queryFn: () =>
      api.templates({
        pageSize: 100,
        status: 'ACTIVE',
        programId: registration.program.id,
        documentType: 'ADMISSION_LETTER',
      }),
  });
  const [letterNumber, setLetterNumber] = useState('');
  const [issueDate, setIssueDate] = useState(today);
  const [authorityReference, setAuthority] = useState('');
  const [policyChoice, setPolicy] = useState('');
  const [templateChoice, setTemplate] = useState('');
  const [mode, setMode] = useState<'generate' | 'upload'>('generate');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ url: string; source: string } | null>(null);
  const only = (rows: readonly { id: string }[] | undefined) =>
    rows?.length === 1 ? (rows[0]?.id ?? '') : '';
  const policyId = policyChoice === '' ? only(policies.data?.data) : policyChoice;
  const templateId = templateChoice === '' ? only(templates.data?.data) : templateChoice;
  const metadata = {
    registrationId: registration.id,
    policyId,
    templateId,
    certificateNumber: letterNumber.trim(),
    issueDate,
    authorityReference: authorityReference.trim(),
  };
  // A preview belongs to exactly these inputs; any change asks for a new one.
  const source = JSON.stringify({ ...metadata, mode, file: file ? [file.name, file.size] : null });
  const current = preview?.source === source ? preview : null;
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  const show = (blob: Blob) => {
    setPreview({ url: URL.createObjectURL(blob), source });
  };
  const previewLetter = useMutation({
    mutationFn: async () =>
      mode === 'generate' ? api.admissionLetterPreview(metadata) : (file as Blob),
    onSuccess: (blob) => {
      show(blob);
      onPreviewed();
    },
  });
  const prepare = useMutation({
    mutationFn: () =>
      api.prepare(
        prepareOfficialDocumentSchema.parse({
          ...metadata,
          documentType: 'ADMISSION_LETTER',
          ...(mode === 'generate' ? { generate: true } : {}),
        }),
        mode === 'upload' ? (file ?? undefined) : undefined,
      ),
    onSuccess: (receipt) => {
      onPrepared(receipt.id);
    },
  });
  const nationality = student.data?.nationality;
  const missing = [
    !letterNumber.trim() && 'letter number',
    !authorityReference.trim() && 'issuance authority reference',
    !policyId && 'approved policy',
    !templateId && 'active template',
    mode === 'upload' && !file && 'PDF file',
  ].filter(Boolean);
  const blocked = !['ACTIVE', 'COMPLETED'].includes(registration.status);

  return (
    <div className="mt-6 grid gap-6">
      <section aria-labelledby={`${formId}-details`}>
        <h3 id={`${formId}-details`} className="font-semibold text-navy-950">
          2. Confirm Letter Details
        </h3>
        <dl className="mt-3 rounded-lg border border-border px-4">
          <Row
            label="Letter Number"
            value={
              <Input
                aria-label="Letter Number"
                value={letterNumber}
                onChange={(event) => {
                  setLetterNumber(event.target.value);
                }}
                maxLength={64}
                pattern="[A-Za-z0-9][A-Za-z0-9._/-]*"
                required
                className="min-h-10 max-w-sm"
                placeholder="As printed on the letter"
              />
            }
          />
          <Row
            label="Student Name"
            value={registration.studentName}
            action={
              <>
                <span className="text-muted-foreground">{registration.registrationNumber}</span>
                <Button variant="link" size="sm" className="h-auto p-0" onClick={onChange}>
                  Change student
                </Button>
              </>
            }
          />
          <Row
            label="Nationality"
            value={
              !canReadStudent
                ? 'From the student record'
                : student.isPending
                  ? '…'
                  : (nationality ?? <span className="text-danger-text">Not recorded</span>)
            }
            action={
              canReadStudent &&
              !student.isPending &&
              !nationality &&
              (canEditStudent ? (
                <Link
                  href={`/admin/students/${registration.studentId}?edit=personal` as Route}
                  className="text-sm text-brand underline"
                >
                  Add nationality
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Ask the registrar to record it.
                </span>
              ))
            }
          />
          <Row label="Course Name" value={registration.program.name} />
          <Row
            label="Course Level"
            value={program.data?.level ?? (canReadProgram ? '—' : 'From the course')}
          />
          <Row
            label="School / Department Name"
            value={
              registration.department?.name ??
              program.data?.department?.name ??
              (canReadProgram ? '—' : 'From the course')
            }
          />
        </dl>
        {blocked && (
          <p role="alert" className="mt-3 text-sm text-danger-text">
            This registration is {registration.status.toLowerCase()}. Letters can only be issued for
            active or completed registrations.
          </p>
        )}
        {policies.data && !policies.data.data.length && (
          <p role="alert" className="mt-3 text-sm text-danger-text">
            No approved admission-letter policy exists for this course.
          </p>
        )}
        {templates.data && !templates.data.data.length && (
          <p role="alert" className="mt-3 text-sm text-danger-text">
            No active admission-letter template exists for this course. Prepare one under Templates;
            a second person activates it.
          </p>
        )}
        <details className="mt-3 rounded-lg border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Advanced details</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label htmlFor={`${formId}-date`} className="grid gap-1.5 text-sm font-medium">
              Issue date
              <Input
                id={`${formId}-date`}
                type="date"
                value={issueDate}
                onChange={(event) => {
                  setIssueDate(event.target.value);
                }}
                required
                className="min-h-10"
              />
            </label>
            <label htmlFor={`${formId}-authority`} className="grid gap-1.5 text-sm font-medium">
              Issuance authority reference
              <Input
                id={`${formId}-authority`}
                value={authorityReference}
                onChange={(event) => {
                  setAuthority(event.target.value);
                }}
                maxLength={200}
                required
                className="min-h-10"
              />
            </label>
            {(policies.data?.data.length ?? 0) > 1 && (
              <label className="grid gap-1.5 text-sm font-medium">
                Approved policy
                <select
                  value={policyChoice}
                  onChange={(event) => {
                    setPolicy(event.target.value);
                  }}
                  className="min-h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select policy</option>
                  {policies.data?.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.definition.institutionName} · {p.definition.authorizationReference}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(templates.data?.data.length ?? 0) > 1 && (
              <label className="grid gap-1.5 text-sm font-medium">
                Letter template
                <select
                  value={templateChoice}
                  onChange={(event) => {
                    setTemplate(event.target.value);
                  }}
                  className="min-h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select template</option>
                  {templates.data?.data.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · v{t.version}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Policy:{' '}
              {policies.data?.data.find((p) => p.id === policyId)?.definition.institutionName ??
                '—'}{' '}
              · Template: {templates.data?.data.find((t) => t.id === templateId)?.name ?? '—'}
            </p>
          </div>
        </details>
      </section>

      <section aria-labelledby={`${formId}-pdf`}>
        <h3 id={`${formId}-pdf`} className="font-semibold text-navy-950">
          3. Admission Letter PDF
        </h3>
        <fieldset className="mt-3 flex flex-wrap gap-3">
          <legend className="sr-only">PDF source</legend>
          {(
            [
              ['generate', 'Generate PDF Automatically'],
              ['upload', 'Upload Existing PDF'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-medium',
                mode === value ? 'border-brand bg-brand/5' : 'border-border',
              )}
            >
              <input
                type="radio"
                name={`${formId}-mode`}
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === 'generate'
            ? 'The letter is generated in the university’s format with its verification QR printed inside (the preview shows an empty QR area; the QR is added on Submit for Approval and works once the letter is issued). Generated letters are unsigned: print the issued letter for the signature and seal, or upload the already signed PDF instead.'
            : 'Upload the university’s signed PDF. It is stored unchanged with its checksum.'}
        </p>
        {mode === 'upload' && (
          <label
            htmlFor={`${formId}-file`}
            className="mt-3 grid max-w-md gap-1.5 text-sm font-medium"
          >
            Signed PDF (max 10 MB)
            <Input
              id={`${formId}-file`}
              type="file"
              accept="application/pdf"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
              }}
              className="min-h-11"
            />
          </label>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={previewLetter.isPending || missing.length > 0 || blocked}
            onClick={() => {
              previewLetter.mutate();
            }}
          >
            {mode === 'generate' ? 'Generate PDF' : 'Preview Letter'}
          </Button>
          <Button
            className="min-h-11"
            disabled={!current || prepare.isPending || blocked}
            onClick={() => {
              prepare.mutate();
            }}
          >
            Submit for Approval
          </Button>
        </div>
        {missing.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Still needed: {missing.join(', ')}.</p>
        )}
        {previewLetter.isError && <Problem error={previewLetter.error} />}
        {prepare.isError && <Problem error={prepare.error} />}
        {current && (
          <iframe
            title="Admission letter preview"
            src={current.url}
            className="mt-4 h-[70dvh] w-full rounded-lg border border-border bg-white"
          />
        )}
      </section>
    </div>
  );
}
