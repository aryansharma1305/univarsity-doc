'use client';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { prepareOfficialDocumentSchema, type Registration } from '@docversity/validation';
import { ErrorState } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { certificateRequestsApi } from '@/features/certificate-requests/api';
import { programsApi } from '@/features/programs/api';
import { studentsApi } from '@/features/students/api';
import { Problem, Row, today } from './admission-letter-issue';
import { officialApi as api } from './api';

export const CERTIFICATE_STEPS = [
  'Select Student',
  'Select Certificate Type',
  'Generate or Upload PDF',
  'Review',
  'Approve and Issue',
] as const;

export const CERTIFICATE_TYPES = ['TRANSCRIPT', 'PROVISIONAL', 'CHARACTER', 'MIGRATION'] as const;
export type IssuableCertificate = (typeof CERTIFICATE_TYPES)[number];
const TYPE_LABELS: Record<IssuableCertificate, string> = {
  TRANSCRIPT: 'Transcript',
  PROVISIONAL: 'Provisional Certificate',
  CHARACTER: 'Character Certificate',
  MIGRATION: 'Migration Certificate',
};

/**
 * Steps 1–3 of issuing a certificate, ending in "Submit for Approval". Preparation still needs the
 * student's reviewed application of the same type (with its approved policy), an active template for
 * the course and, for migration, the course's approval for that type — all enforced by the API.
 */
export function CertificateIssue({
  initialType,
  initialRequest,
  onPrepared,
  onStep,
}: {
  initialType: IssuableCertificate;
  initialRequest: string;
  onPrepared: (id: string) => void;
  /** 0 select student · 1 type and details · 2 PDF ready to submit. */
  onStep: (step: number) => void;
}) {
  const canPrepare = useCan(PERMISSIONS.certificatesGenerate);
  const client = useQueryClient();
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [registration, setRegistration] = useState<Registration | null>(null);
  const request = useQuery({
    queryKey: ['official', 'request', initialRequest],
    queryFn: () => certificateRequestsApi.detail(false, initialRequest),
    enabled: !!initialRequest && canPrepare,
  });
  const registrations = useQuery({
    queryKey: ['official', 'registrations', search],
    queryFn: () => api.registrations(search, 1),
    enabled: search.length >= 2 && canPrepare,
  });
  if (!canPrepare)
    return (
      <p className="rounded-xl border border-border bg-card p-5 text-sm">
        Your role can view certificates but cannot prepare them. A staff member with certificate
        preparation access prepares the certificate; another approves and issues it.
      </p>
    );
  const owner = request.data?.student?.registrations[0];
  return (
    <section aria-labelledby="cert-student" className="rounded-xl border border-border bg-card p-5">
      <h3 id="cert-student" className="font-semibold text-navy-950">
        1. Select Student
      </h3>
      <form
        className="mt-3 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(term.trim());
          setRegistration(null);
          onStep(0);
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
      {owner && !search && (
        <Button
          variant="link"
          className="mt-2 h-auto p-0"
          onClick={() => {
            setTerm(owner);
            setSearch(owner);
          }}
        >
          Use the applicant of the reviewed application ({owner})
        </Button>
      )}
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
        <CertificateDetails
          key={registration.id}
          registration={registration}
          initialType={initialType}
          initialRequest={initialRequest}
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

function CertificateDetails({
  registration,
  initialType,
  initialRequest,
  onChange,
  onPreviewed,
  onPrepared,
}: {
  registration: Registration;
  initialType: IssuableCertificate;
  initialRequest: string;
  onChange: () => void;
  onPreviewed: () => void;
  onPrepared: (id: string) => void;
}) {
  const formId = useId();
  const canReadStudent = useCan(PERMISSIONS.studentsRead);
  const canReadProgram = useCan(PERMISSIONS.programsRead);
  const [type, setType] = useState<IssuableCertificate>(initialType);
  const [chosenRequest, setRequest] = useState(initialRequest);
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState(today);
  const [authorityReference, setAuthority] = useState('');
  const [templateChoice, setTemplate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ url: string; source: string } | null>(null);
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
  // Only reviewed applications of this student, this type, can back a certificate.
  const requests = useQuery({
    queryKey: ['official', 'requests', registration.registrationNumber, type],
    queryFn: () =>
      certificateRequestsApi.list(false, {
        page: 1,
        pageSize: 50,
        status: 'REVIEW_COMPLETED',
        certificateType: type,
        search: registration.registrationNumber,
      }),
  });
  const eligible = (requests.data?.data ?? []).filter(
    (r) =>
      r.certificateType === type &&
      r.student?.registrations.includes(registration.registrationNumber),
  );
  const selected =
    eligible.find((r) => r.id === chosenRequest) ??
    (eligible.length === 1 ? eligible[0] : undefined);
  const templates = useQuery({
    queryKey: ['official', 'templates', registration.program.id, type],
    queryFn: () =>
      api.templates({
        pageSize: 100,
        status: 'ACTIVE',
        programId: registration.program.id,
        documentType: type,
      }),
  });
  const templateList = templates.data?.data ?? [];
  const templateId =
    templateChoice === ''
      ? templateList.length === 1
        ? (templateList[0]?.id ?? '')
        : ''
      : templateChoice;
  const source = JSON.stringify({
    type,
    request: selected?.id,
    number,
    issueDate,
    authorityReference,
    templateId,
    file: file ? [file.name, file.size] : null,
  });
  const current = preview?.source === source ? preview : null;
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  const prepare = useMutation({
    mutationFn: () =>
      api.prepare(
        prepareOfficialDocumentSchema.parse({
          registrationId: registration.id,
          documentType: type,
          policyId: selected?.policyId,
          requestId: selected?.id,
          templateId,
          certificateNumber: number.trim(),
          issueDate,
          authorityReference: authorityReference.trim(),
        }),
        file ?? undefined,
      ),
    onSuccess: (receipt) => {
      onPrepared(receipt.id);
    },
  });
  const blocked = !['ACTIVE', 'COMPLETED'].includes(registration.status);
  const missing = [
    !selected && 'reviewed application',
    !number.trim() && 'certificate number',
    !authorityReference.trim() && 'issuance authority reference',
    !templateId && 'active template',
    !file && 'signed PDF',
  ].filter(Boolean);

  return (
    <div className="mt-6 grid gap-6">
      <section aria-labelledby={`${formId}-type`}>
        <h3 id={`${formId}-type`} className="font-semibold text-navy-950">
          2. Select Certificate Type
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label htmlFor={`${formId}-cert-type`} className="grid gap-1.5 text-sm font-medium">
            Certificate Type
            <select
              id={`${formId}-cert-type`}
              value={type}
              onChange={(event) => {
                setType(event.target.value as IssuableCertificate);
                setRequest('');
                setTemplate('');
              }}
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
            >
              {CERTIFICATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          {eligible.length > 1 && (
            <label htmlFor={`${formId}-request`} className="grid gap-1.5 text-sm font-medium">
              Reviewed application
              <select
                id={`${formId}-request`}
                value={selected?.id ?? ''}
                onChange={(event) => {
                  setRequest(event.target.value);
                }}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select application</option>
                {eligible.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reference}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {requests.isError && <ErrorState error={requests.error} />}
        {requests.data && !eligible.length && (
          <p role="alert" className="mt-3 text-sm text-danger-text">
            No reviewed {TYPE_LABELS[type].toLowerCase()} application for this student. Complete the
            application review first in{' '}
            <Link href="/admin/certificate-requests" className="underline">
              Certificate Requests
            </Link>
            .
          </p>
        )}
        {selected && (
          <p className="mt-2 text-sm text-muted-foreground">
            Reviewed application {selected.reference}
          </p>
        )}
        <dl className="mt-3 rounded-lg border border-border px-4">
          <Row
            label="Certificate Number"
            value={
              <Input
                aria-label="Certificate Number"
                value={number}
                onChange={(event) => {
                  setNumber(event.target.value);
                }}
                maxLength={64}
                required
                className="min-h-10 max-w-sm"
                placeholder="As printed on the certificate"
              />
            }
          />
          <Row
            label="Student Name"
            value={registration.studentName}
            action={
              <Button variant="link" size="sm" className="h-auto p-0" onClick={onChange}>
                Change student
              </Button>
            }
          />
          <Row label="Registration Number" value={registration.registrationNumber} />
          {/* Shown when the student record holds it; not every certificate prints nationality. */}
          {student.data?.nationality && (
            <Row label="Nationality" value={student.data.nationality} />
          )}
          <Row label="Course Name" value={registration.program.name} />
          <Row label="Course Level" value={program.data?.level ?? '—'} />
          <Row
            label="School / Department"
            value={registration.department?.name ?? program.data?.department?.name ?? '—'}
          />
          <Row label="Certificate Type" value={TYPE_LABELS[type]} />
          <Row
            label="Issue Date"
            value={
              <Input
                aria-label="Issue Date"
                type="date"
                value={issueDate}
                onChange={(event) => {
                  setIssueDate(event.target.value);
                }}
                className="min-h-10 max-w-48"
              />
            }
          />
        </dl>
        {blocked && (
          <p role="alert" className="mt-3 text-sm text-danger-text">
            This registration is {registration.status.toLowerCase()}. Certificates can only be
            issued for active or completed registrations.
          </p>
        )}
        {templates.data && !templateList.length && (
          <p role="alert" className="mt-3 text-sm text-danger-text">
            No active {TYPE_LABELS[type].toLowerCase()} template exists for this course. Prepare one
            under Templates; a second person activates it.
          </p>
        )}
        <details className="mt-3 rounded-lg border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Advanced details</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label htmlFor={`${formId}-authority`} className="grid gap-1.5 text-sm font-medium">
              Issuance authority reference
              <Input
                id={`${formId}-authority`}
                value={authorityReference}
                onChange={(event) => {
                  setAuthority(event.target.value);
                }}
                maxLength={200}
                className="min-h-10"
              />
            </label>
            {templateList.length > 1 && (
              <label htmlFor={`${formId}-template`} className="grid gap-1.5 text-sm font-medium">
                Certificate template
                <select
                  id={`${formId}-template`}
                  value={templateChoice}
                  onChange={(event) => {
                    setTemplate(event.target.value);
                  }}
                  className="min-h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select template</option>
                  {templateList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · v{t.version}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </details>
      </section>

      <section aria-labelledby={`${formId}-pdf`}>
        <h3 id={`${formId}-pdf`} className="font-semibold text-navy-950">
          3. Certificate PDF
        </h3>
        <fieldset className="mt-3 flex flex-wrap gap-3">
          <legend className="sr-only">PDF source</legend>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground">
            <input type="radio" name={`${formId}-mode`} disabled />
            Generate PDF
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-brand bg-brand/5 px-4 text-sm font-medium">
            <input type="radio" name={`${formId}-mode`} defaultChecked />
            Upload PDF
          </label>
        </fieldset>
        <p className="mt-2 text-sm text-muted-foreground">
          Certificates are not generated yet: each type needs university-approved wording. Upload
          the university’s signed PDF; it is stored unchanged with its checksum.
        </p>
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
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={!file || blocked}
            onClick={() => {
              if (!file) return;
              setPreview({ url: URL.createObjectURL(file), source });
              onPreviewed();
            }}
          >
            Preview Certificate
          </Button>
          <Button
            className="min-h-11"
            disabled={!current || missing.length > 0 || prepare.isPending || blocked}
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
        {prepare.isError && <Problem error={prepare.error} />}
        {current && (
          <iframe
            title="Certificate preview"
            src={current.url}
            className="mt-4 h-[70dvh] w-full rounded-lg border border-border bg-white"
          />
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          <Link href={'/admin/certificate-requests'} className="underline">
            Certificate Requests
          </Link>{' '}
          holds the reviewed applications this step needs.
        </p>
      </section>
    </div>
  );
}
