'use client';
import { useId, useState, type ReactNode, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@docversity/types';
import {
  attestOfficialResultSchema,
  certificateTypeSchema,
  prepareOfficialDocumentSchema,
  prepareOfficialTemplateSchema,
  proposeVerificationPolicySchema,
  publicVerificationServiceSchema,
  type Registration,
  PUBLIC_CREDENTIAL_ACCESS_LABELS,
  PUBLIC_DISCLOSURE_FIELD_LABELS,
  PUBLIC_DISCLOSURE_FIELDS,
  type PublicDisclosure,
} from '@docversity/validation';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@docversity/ui/components/tabs';
import { PageHeader } from '@/components/data/page-header';
import { Pagination } from '@/components/data/pagination';
import { ErrorState, TableSkeleton, ForbiddenState } from '@/components/data/states';
import { useCan, useSessionUser } from '@/components/providers/session-context';
import { useProgramOptions } from '@/features/programs/api';
import { certificateRequestsApi } from '@/features/certificate-requests/api';
import { resultReviewApi } from '@/features/result-review/api';
import { officialApi as api } from './api';
import { useListParams } from '@/hooks/use-list-params';
const listKeys = ['tab', 'service', 'type'] as const;
function useOfficialList() {
  const { page, update, values } = useListParams(listKeys);
  return {
    page,
    values,
    update,
    setPage: (next: number) => {
      update({ page: next });
    },
  };
}
const types = ['ADMISSION_LETTER', 'TRANSCRIPT', 'PROVISIONAL', 'CHARACTER'] as const;
const label = (value: string) => value.replaceAll('_', ' ');
function isDocumentService(service: string) {
  return service === 'admission-letter' || service === 'certificate';
}
function policyAudience(service: string, disclosure?: PublicDisclosure) {
  if (disclosure?.anonymousLookup) {
    const fields = disclosure.fields.map((f) => PUBLIC_DISCLOSURE_FIELD_LABELS[f] ?? f).join(', ');
    const credential = disclosure.documentWithCredential
      ? ` ${PUBLIC_CREDENTIAL_ACCESS_LABELS[service] ?? ''}.`
      : '';
    return `Anyone can check this ${label(service).toLowerCase()} without signing in. Shown: ${fields || 'status only'}.${credential}`;
  }
  if (isDocumentService(service))
    return 'Anyone with the document number or secure QR code can check its status and approved details. The PDF stays private.';
  if (service === 'registration')
    return 'Only the signed-in student can check their own registration.';
  if (service === 'result')
    return 'Only the signed-in student can view their own published results.';
  return '';
}
function Field({
  title,
  name,
  type = 'text',
  required = true,
  defaultValue,
  maxLength = 200,
}: {
  title: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  maxLength?: number;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {title}
      <Input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        maxLength={maxLength}
        className="min-h-11 h-auto whitespace-normal"
      />
    </label>
  );
}
function Choice({
  title,
  name,
  value,
  onChange,
  children,
  required = true,
}: {
  title: string;
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  children: ReactNode;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-2 text-sm font-medium">
      <label htmlFor={id}>{title}</label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => {
          onChange?.(event.target.value);
        }}
        required={required}
        className="min-h-11 h-auto whitespace-normal w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="">Select {title.toLowerCase()}</option>
        {children}
      </select>
    </div>
  );
}
function useAction() {
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const action = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onMutate: () => {
      setMessage('');
    },
    onSuccess: async () => {
      setMessage(
        'Action saved. The record remains subject to its separate approval and publication controls.',
      );
      await client.invalidateQueries({ queryKey: ['official'] });
      await client.invalidateQueries({ queryKey: ['result-review-detail'] });
    },
  });
  return { action, message };
}
function Feedback({ operation }: { operation: ReturnType<typeof useAction> }) {
  return (
    <>
      {operation.message && (
        <p role="status" className="my-4 text-sm text-brand">
          {operation.message}
        </p>
      )}
      {operation.action.isError && (
        <div className="my-4">
          <ErrorState error={operation.action.error} />
        </div>
      )}
    </>
  );
}
function submit(
  event: SyntheticEvent<HTMLFormElement>,
  operation: ReturnType<typeof useAction>,
  run: (data: FormData) => Promise<unknown>,
) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  operation.action.mutate(() => run(data));
}
const text = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};
function PolicyPanel() {
  const user = useSessionUser(),
    manage = useCan(PERMISSIONS.verificationPoliciesManage),
    programs = useProgramOptions();
  const { page, setPage, values } = useOfficialList();
  const selectedService = publicVerificationServiceSchema.safeParse(values.service).data;
  const [service, setService] = useState<string>(selectedService ?? 'admission-letter'),
    [application, setApplication] = useState(false),
    [anonymous, setAnonymous] = useState(false);
  const query = useQuery({
    queryKey: ['official', 'policies', page, selectedService],
    queryFn: () =>
      api.policies({ page, pageSize: 25, sortOrder: 'desc', service: selectedService }),
  });
  const operation = useAction();
  return (
    <>
      <h2 className="text-lg font-semibold">University verification policies</h2>
      {selectedService && (
        <p className="mt-2 text-sm">
          Showing {selectedService.replaceAll('-', ' ')} policies.{' '}
          <Link href="/admin/official-records?tab=policies" className="text-brand underline">
            View all policies
          </Link>
        </p>
      )}
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Proposals do not authorize disclosure. Approval requires a second authorized person and the
        server’s institutional approval gate. Never enter a provisional name as a confirmed legal
        issuer.
      </p>
      {manage && (
        <form
          className="my-6 grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"
          onSubmit={(event) => {
            submit(event, operation, async (data) =>
              api.propose(
                proposeVerificationPolicySchema.parse({
                  service,
                  programId: text(data, 'programId'),
                  definition: {
                    usage: 'OFFICIAL',
                    institutionName: text(data, 'institutionName'),
                    authorizationReference: text(data, 'authorizationReference'),
                    discloseProgram: data.has('discloseProgram'),
                    discloseIssueDate: data.has('discloseIssueDate'),
                    identityFactor: 'AUTHENTICATED_OWNER',
                    resultMode: 'REVIEWED_VALUES_ONLY',
                    ...(anonymous
                      ? {
                          publicDisclosure: {
                            anonymousLookup: true,
                            fields: data.getAll('publicField').map(String),
                            documentWithCredential: data.has('documentWithCredential'),
                          },
                        }
                      : {}),
                    ...(service === 'certificate' && application
                      ? {
                          application: {
                            certificateType: text(data, 'certificateType'),
                            eligibilityReference: text(data, 'eligibilityReference'),
                            fields: {
                              purposeRequired: true,
                              remarksAllowed: data.has('remarksAllowed'),
                            },
                            evidence: {
                              requirement: 'NONE',
                              authorityReference: text(data, 'evidenceReference'),
                            },
                            fee: {
                              kind: 'APPROVED_EXEMPTION',
                              authorityReference: text(data, 'feeReference'),
                            },
                            actions: ['SUBMIT', 'RESPOND', 'CANCEL'],
                            reviewAuthorityReference: text(data, 'reviewReference'),
                          },
                        }
                      : {}),
                  },
                }),
              ),
            );
          }}
        >
          <Choice title="Program" name="programId">
            {programs.options.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Choice>
          <Choice title="Verification service" name="service" value={service} onChange={setService}>
            {['admission-letter', 'certificate', 'registration', 'result'].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Choice>
          {service && <p className="text-sm sm:col-span-2">{policyAudience(service)}</p>}
          <Field title="Approved legal issuing institution" name="institutionName" />
          <Field title="University approval reference" name="authorizationReference" />
          {(isDocumentService(service) || service === 'registration') && (
            <label className="flex min-h-11 h-auto whitespace-normal items-center gap-3 text-sm">
              <input name="discloseProgram" type="checkbox" />
              Program name disclosure is approved
            </label>
          )}
          {isDocumentService(service) && (
            <label className="flex min-h-11 h-auto whitespace-normal items-center gap-3 text-sm">
              <input name="discloseIssueDate" type="checkbox" />
              Issue date disclosure is approved
            </label>
          )}
          {service === 'certificate' && (
            <label className="flex min-h-11 h-auto whitespace-normal items-center gap-3 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={application}
                onChange={(event) => {
                  setApplication(event.target.checked);
                }}
              />
              Include approved application and staff review rules
            </label>
          )}
          {service === 'certificate' && application && (
            <>
              <Choice title="Certificate application type" name="certificateType">
                {types
                  .filter((t) => t !== 'ADMISSION_LETTER')
                  .map((t) => (
                    <option key={t} value={t}>
                      {label(t)}
                    </option>
                  ))}
              </Choice>
              <Field
                title="Active-registration eligibility approval reference"
                name="eligibilityReference"
              />
              <Field title="No-additional-evidence approval reference" name="evidenceReference" />
              <Field title="Fee exemption approval reference" name="feeReference" />
              <Field title="Staff review authority reference" name="reviewReference" />
              <label className="flex min-h-11 h-auto whitespace-normal items-center gap-3 text-sm">
                <input type="checkbox" name="remarksAllowed" />
                Student remarks are approved
              </label>
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Only explicitly approved no-additional-evidence and fee-exemption rules are
                supported here. This proposal never activates a payment provider.
              </p>
            </>
          )}
          <fieldset className="grid gap-3 rounded-lg border border-border p-4 sm:col-span-2">
            <legend className="px-1 text-sm font-semibold">
              Anonymous verification (no sign-in)
            </legend>
            <label className="flex min-h-11 h-auto whitespace-normal items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(event) => {
                  setAnonymous(event.target.checked);
                }}
              />
              The university authorizes checks without a student sign-in for this course
            </label>
            {anonymous && (
              <>
                <p className="text-sm text-muted-foreground">
                  Choose only the fields the university has approved for public display. Photos,
                  dates of birth, identity numbers, contact details and uploads can never be shown.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PUBLIC_DISCLOSURE_FIELDS[publicVerificationServiceSchema.parse(service)].map(
                    (field) => (
                      <label
                        key={field}
                        className="flex min-h-11 h-auto whitespace-normal items-center gap-3 text-sm"
                      >
                        <input type="checkbox" name="publicField" value={field} />
                        {PUBLIC_DISCLOSURE_FIELD_LABELS[field]}
                      </label>
                    ),
                  )}
                </div>
                {PUBLIC_CREDENTIAL_ACCESS_LABELS[service] && (
                  <label className="flex min-h-11 h-auto whitespace-normal items-center gap-3 text-sm">
                    <input type="checkbox" name="documentWithCredential" />
                    Allow: {PUBLIC_CREDENTIAL_ACCESS_LABELS[service]}
                  </label>
                )}
              </>
            )}
          </fieldset>
          <Button
            type="submit"
            disabled={operation.action.isPending}
            className="min-h-11 h-auto whitespace-normal w-fit"
          >
            Save policy proposal
          </Button>
        </form>
      )}
      <Feedback operation={operation} />
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <div className="mt-5 divide-y rounded-xl border border-border bg-card">
            {query.data.data.length ? (
              query.data.data.map((p) => (
                <article
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div className="min-w-0">
                    <h3 className="font-semibold break-words">{p.definition.institutionName}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {p.service} · {p.status} ·{' '}
                      {programs.programs.find((program) => program.id === p.programId)?.name ??
                        'Program'}
                    </p>
                    <p className="mt-1 text-xs break-all text-muted-foreground">
                      {p.definition.authorizationReference}
                    </p>
                    <p className="mt-2 text-sm">
                      {policyAudience(p.service, p.definition.publicDisclosure)}
                    </p>
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer font-medium">
                        Review proposed rules
                      </summary>
                      <dl className="mt-3 grid gap-2">
                        {(isDocumentService(p.service) || p.service === 'registration') && (
                          <div>
                            <dt className="font-medium">Program name</dt>
                            <dd>{p.definition.discloseProgram ? 'Allowed' : 'Hidden'}</dd>
                          </div>
                        )}
                        {isDocumentService(p.service) && (
                          <div>
                            <dt className="font-medium">Issue date</dt>
                            <dd>{p.definition.discloseIssueDate ? 'Allowed' : 'Hidden'}</dd>
                          </div>
                        )}
                        {p.service === 'result' && (
                          <div>
                            <dt className="font-medium">Results available to the student</dt>
                            <dd>Independently reviewed and published results</dd>
                          </div>
                        )}
                        {p.definition.application && (
                          <>
                            <div>
                              <dt className="font-medium">Application type</dt>
                              <dd>{label(p.definition.application.certificateType)}</dd>
                            </div>
                            <div>
                              <dt className="font-medium">Eligibility authority</dt>
                              <dd className="break-all">
                                {p.definition.application.eligibilityReference}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-medium">Evidence exemption authority</dt>
                              <dd className="break-all">
                                {p.definition.application.evidence.authorityReference}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-medium">Fee exemption authority</dt>
                              <dd className="break-all">
                                {p.definition.application.fee.authorityReference}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-medium">Review authority</dt>
                              <dd className="break-all">
                                {p.definition.application.reviewAuthorityReference}
                              </dd>
                            </div>
                          </>
                        )}
                      </dl>
                    </details>
                    {!p.approvalAvailable && (
                      <p className="mt-2 text-sm">
                        Institutional activation approval is pending. This policy cannot be approved
                        yet.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {manage && p.status === 'DRAFT' && (
                      <Button
                        className="min-h-11 h-auto whitespace-normal"
                        disabled={
                          !p.approvalAvailable ||
                          p.proposedById === user.id ||
                          operation.action.isPending
                        }
                        onClick={() => {
                          operation.action.mutate(() => api.policyAction(p.id, 'approve'));
                        }}
                      >
                        Approve policy
                      </Button>
                    )}
                    {manage && p.status === 'APPROVED' && (
                      <Button
                        variant="outline"
                        className="min-h-11 h-auto whitespace-normal"
                        disabled={operation.action.isPending}
                        onClick={() => {
                          operation.action.mutate(() => api.policyAction(p.id, 'withdraw'));
                        }}
                      >
                        Withdraw policy
                      </Button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="p-5 text-sm">No verification policies have been proposed.</p>
            )}
          </div>
          <Pagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
function TemplatePanel() {
  const user = useSessionUser(),
    write = useCan(PERMISSIONS.templatesWrite),
    approve = useCan(PERMISSIONS.certificatesApprove),
    programs = useProgramOptions();
  const { page, setPage } = useOfficialList();
  const [program, setProgram] = useState(''),
    [type, setType] = useState('ADMISSION_LETTER');
  const operation = useAction();
  const query = useQuery({
    queryKey: ['official', 'templates', page],
    queryFn: () => api.templates({ page, pageSize: 25, sortOrder: 'desc' }),
  });
  const policies = useQuery({
    queryKey: ['official', 'policies', program, type],
    queryFn: () =>
      api.policies({
        programId: program,
        service: type === 'ADMISSION_LETTER' ? 'admission-letter' : 'certificate',
        status: 'APPROVED',
        pageSize: 100,
      }),
    enabled: !!program,
  });
  return (
    <>
      <h2 className="text-lg font-semibold">Official template versions</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Register a university-approved document format. A second person activates it for this
        program. Sample preview layouts do not become official templates automatically.
      </p>
      {write && (
        <form
          className="my-6 grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"
          onSubmit={(event) => {
            submit(event, operation, async (data) =>
              api.template(
                prepareOfficialTemplateSchema.parse({
                  programId: program,
                  documentType: type,
                  policyId: text(data, 'policyId'),
                  name: text(data, 'name'),
                }),
              ),
            );
          }}
        >
          <Choice title="Template program" name="programId" value={program} onChange={setProgram}>
            {programs.options.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Choice>
          <Choice
            title="Template document type"
            name="documentType"
            value={type}
            onChange={setType}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </Choice>
          <Choice title="Approved template policy" name="policyId">
            {policies.data?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.definition.institutionName} · {p.definition.authorizationReference}
              </option>
            ))}
          </Choice>
          {policies.isError && <ErrorState error={policies.error} />}
          {program && policies.isPending && (
            <p role="status" className="text-sm">
              Loading approved policies…
            </p>
          )}
          {program && policies.data && !policies.data.data.length && (
            <p className="text-sm sm:col-span-2">
              No approved policy is available for this program. Open Policies to prepare and
              independently approve the required authority.
            </p>
          )}
          <Field title="University template name" name="name" maxLength={120} />
          <Button
            type="submit"
            className="min-h-11 h-auto whitespace-normal w-fit"
            disabled={operation.action.isPending || !policies.data?.data.length}
          >
            Prepare template version
          </Button>
        </form>
      )}
      <Feedback operation={operation} />
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <div className="mt-5 divide-y rounded-xl border border-border bg-card">
            {query.data.data.length ? (
              query.data.data.map((t) => (
                <article
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-5"
                >
                  <div>
                    <h3 className="font-semibold">
                      {t.name} · v{t.version}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {label(t.documentType)} · {t.status}
                      {' · '}
                      {t.programIds
                        .map((id) => programs.programs.find((p) => p.id === id)?.name ?? id)
                        .join(', ')}
                    </p>
                  </div>
                  {approve && t.status === 'DRAFT' && (
                    <Button
                      className="min-h-11 h-auto whitespace-normal"
                      disabled={
                        !t.generatedByUserId ||
                        t.generatedByUserId === user.id ||
                        operation.action.isPending
                      }
                      onClick={() => {
                        operation.action.mutate(() => api.approveTemplate(t.id));
                      }}
                    >
                      Approve template
                    </Button>
                  )}
                </article>
              ))
            ) : (
              <p className="p-5 text-sm">No document template versions are recorded.</p>
            )}
          </div>
          <Pagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
function DocumentPanel({ initialRequest }: { initialRequest: string }) {
  const user = useSessionUser(),
    generate = useCan(PERMISSIONS.certificatesGenerate),
    approve = useCan(PERMISSIONS.certificatesApprove),
    issue = useCan(PERMISSIONS.certificatesIssue),
    revoke = useCan(PERMISSIONS.certificatesRevoke),
    privateRead = useCan(PERMISSIONS.historicalDocumentsRead);
  const { page, setPage, values, update } = useOfficialList();
  const search = values.search;
  const [term, setTerm] = useState(search),
    [registration, setRegistration] = useState<Registration | null>(null),
    [typeOverride, setType] = useState<string>(),
    [revoking, setRevoking] = useState(''),
    [verificationUrl, setVerificationUrl] = useState('');
  const operation = useAction();
  const request = useQuery({
    queryKey: ['official', 'request', initialRequest],
    queryFn: () => certificateRequestsApi.detail(false, initialRequest),
    enabled: !!initialRequest && generate,
  });
  const requestOwner = request.data?.student;
  const documentType = prepareOfficialDocumentSchema.shape.documentType.safeParse(values.type).data;
  const type =
    typeOverride ??
    documentType ??
    prepareOfficialDocumentSchema.shape.documentType.safeParse(request.data?.certificateType)
      .data ??
    'ADMISSION_LETTER';
  const registrations = useQuery({
    queryKey: ['official', 'registrations', search],
    queryFn: () => api.registrations(search, 1),
    enabled: !!search && generate,
  });
  const [requestPage, setRequestPage] = useState(1);
  const requests = useQuery({
    queryKey: ['official', 'requests', registration?.id, type, requestPage],
    queryFn: () =>
      certificateRequestsApi.list(false, {
        page: requestPage,
        pageSize: 50,
        status: 'REVIEW_COMPLETED',
        certificateType: certificateTypeSchema.parse(type),
        search: registration?.registrationNumber,
      }),
    enabled: !!registration && type !== 'ADMISSION_LETTER' && generate,
  });
  const eligibleRequests = (requests.data?.data ?? []).filter(
    (r) =>
      r.certificateType === type &&
      r.student?.registrations.includes(registration?.registrationNumber ?? ''),
  );
  const [chosenRequest, setRequest] = useState('');
  const selectedRequest = eligibleRequests.find((r) => r.id === (chosenRequest || initialRequest));
  const policies = useQuery({
    queryKey: ['official', 'policies', registration?.program.id, type],
    queryFn: () =>
      api.policies({
        pageSize: 100,
        status: 'APPROVED',
        programId: registration?.program.id,
        service: type === 'ADMISSION_LETTER' ? 'admission-letter' : 'certificate',
      }),
    enabled: !!registration && generate,
  });
  const templates = useQuery({
    queryKey: ['official', 'templates', registration?.program.id, type],
    queryFn: () =>
      api.templates({
        pageSize: 100,
        status: 'ACTIVE',
        programId: registration?.program.id,
        documentType: prepareOfficialDocumentSchema.shape.documentType.parse(type),
      }),
    enabled: !!registration && generate,
  });
  const query = useQuery({
    queryKey: ['official', 'documents', page, documentType],
    queryFn: () => api.documents({ page, pageSize: 25, sortOrder: 'desc', documentType }),
  });
  return (
    <>
      <h2 className="text-lg font-semibold">Issue and revoke official documents</h2>
      {documentType && (
        <p className="mt-2 text-sm">
          Showing {label(documentType).toLowerCase()} records.{' '}
          <Link href="/admin/official-records" className="text-brand underline">
            View all documents
          </Link>
        </p>
      )}
      {verificationUrl && (
        <div role="status" className="my-4 rounded-xl border border-border bg-card p-5 text-sm">
          <p>The issued document’s secure verification link is ready.</p>
          <a
            href={verificationUrl}
            className="mt-2 inline-flex min-h-11 h-auto whitespace-normal items-center font-medium text-brand underline"
          >
            Open issued verification link
          </a>
        </div>
      )}
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Use the university’s approved PDF and document number. Registration imports do not create
        admission letters. Certificate preparation also requires the matching reviewed application
        and its current approved policy.
      </p>
      {generate && (
        <section
          className="my-6 rounded-xl border border-border bg-card p-5"
          aria-label="Prepare official document"
        >
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              update({ search: term });
              setRegistration(null);
            }}
          >
            <label
              htmlFor="official-registration-search"
              className="grid flex-1 gap-2 text-sm font-medium"
            >
              Find registration
              <Input
                id="official-registration-search"
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                }}
                required
                minLength={3}
                maxLength={64}
                className="min-h-11 h-auto whitespace-normal"
              />
            </label>
            <Button
              type="submit"
              variant="outline"
              className="min-h-11 h-auto whitespace-normal self-end"
            >
              Find student registration
            </Button>
          </form>
          {requestOwner && (
            <Button
              variant="outline"
              className="mt-4 min-h-11 h-auto whitespace-normal"
              onClick={() => {
                const number = requestOwner.registrations[0];
                if (number) {
                  setTerm(number);
                  update({ search: number });
                }
              }}
            >
              Find registration for this reviewed application
            </Button>
          )}
          {registrations.isFetching && (
            <p role="status" className="mt-4 text-sm">
              Finding authorized registrations…
            </p>
          )}
          {registrations.isError && <ErrorState error={registrations.error} />}
          {registrations.data && !registration && (
            <ul className="mt-4 divide-y">
              {registrations.data.data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="text-sm">
                    {r.registrationNumber} · {r.studentName} · {r.program.name} · {r.status}
                  </span>
                  <Button
                    variant="outline"
                    className="min-h-11 h-auto whitespace-normal"
                    onClick={() => {
                      setRegistration(r);
                      setRequest('');
                    }}
                  >
                    Use registration
                  </Button>
                </li>
              ))}
              {!registrations.data.data.length && (
                <li className="py-3 text-sm">No matching university registration was found.</li>
              )}
            </ul>
          )}
          {registration && (
            <form
              className="mt-6 grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                submit(event, operation, async (data) => {
                  const file = data.get('file');
                  if (!(file instanceof File) || !file.size)
                    throw new Error('Choose the university-approved PDF.');
                  return api.prepare(
                    prepareOfficialDocumentSchema.parse({
                      registrationId: registration.id,
                      documentType: type,
                      policyId:
                        type === 'ADMISSION_LETTER'
                          ? text(data, 'policyId')
                          : selectedRequest?.policyId,
                      templateId: text(data, 'templateId'),
                      certificateNumber: text(data, 'certificateNumber'),
                      issueDate: text(data, 'issueDate'),
                      authorityReference: text(data, 'authorityReference'),
                      ...(type !== 'ADMISSION_LETTER' ? { requestId: selectedRequest?.id } : {}),
                    }),
                    file,
                  );
                });
              }}
            >
              <p className="text-sm font-medium sm:col-span-2">
                Preparing for {registration.registrationNumber} · {registration.studentName} ·{' '}
                {registration.program.name}
              </p>
              {policies.isError && <ErrorState error={policies.error} />}
              {templates.isError && <ErrorState error={templates.error} />}
              {(policies.isPending || templates.isPending) && (
                <p role="status" className="text-sm sm:col-span-2">
                  Loading approved policy and template versions…
                </p>
              )}
              {policies.data && !policies.data.data.length && (
                <p className="text-sm sm:col-span-2">
                  No approved policy is available. Open Policies to record the university’s
                  authority and obtain independent approval.
                </p>
              )}
              {templates.data && !templates.data.data.length && (
                <p className="text-sm sm:col-span-2">
                  No active official template is available. Open Templates to prepare and
                  independently approve this program’s document format.
                </p>
              )}
              {type !== 'ADMISSION_LETTER' && requests.data && !eligibleRequests.length && (
                <p className="text-sm sm:col-span-2">
                  No matching reviewed application is available on this page. Complete the
                  certificate application review before preparation.
                </p>
              )}
              <Choice
                title="Official document type"
                name="documentType"
                value={type}
                onChange={(value) => {
                  setType(value || undefined);
                  setRequest('');
                }}
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {label(t)}
                  </option>
                ))}
              </Choice>
              {requests.isError && <ErrorState error={requests.error} />}
              {type === 'ADMISSION_LETTER' ? (
                <Choice title="Document approval policy" name="policyId">
                  {policies.data?.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.definition.institutionName} · {p.definition.authorizationReference}
                    </option>
                  ))}
                </Choice>
              ) : (
                <Choice
                  title="Reviewed certificate application"
                  name="requestId"
                  value={chosenRequest || initialRequest}
                  onChange={setRequest}
                >
                  {eligibleRequests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.reference} · {label(r.certificateType)}
                    </option>
                  ))}
                </Choice>
              )}
              {type !== 'ADMISSION_LETTER' &&
                requests.data &&
                requests.data.meta.totalPages > 1 && (
                  <div className="sm:col-span-2">
                    <Pagination meta={requests.data.meta} onPageChange={setRequestPage} />
                  </div>
                )}
              <Choice title="Active official template" name="templateId">
                {templates.data?.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · v{t.version}
                  </option>
                ))}
              </Choice>
              <Field title="Official document number" name="certificateNumber" maxLength={64} />
              <Field title="Approved issue date" name="issueDate" type="date" />
              <Field title="Issuance authority reference" name="authorityReference" />
              <label
                htmlFor="official-pdf"
                className="grid gap-2 text-sm font-medium sm:col-span-2"
              >
                University-approved PDF
                <Input
                  id="official-pdf"
                  type="file"
                  name="file"
                  required
                  accept="application/pdf"
                  className="min-h-11 h-auto whitespace-normal"
                />
              </label>
              <Button
                type="submit"
                className="min-h-11 h-auto whitespace-normal w-fit"
                disabled={
                  operation.action.isPending ||
                  !policies.data?.data.length ||
                  !templates.data?.data.length ||
                  (type !== 'ADMISSION_LETTER' && !selectedRequest) ||
                  !['ACTIVE', 'COMPLETED'].includes(registration.status)
                }
              >
                Prepare for independent approval
              </Button>
            </form>
          )}
        </section>
      )}
      <Feedback operation={operation} />
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <div className="mt-5 divide-y rounded-xl border border-border bg-card">
            {query.data.data.length ? (
              query.data.data.map((d) => (
                <article key={d.id} className="p-5">
                  <h3 className="font-semibold break-all">
                    {d.certificateNumber ?? 'Unnumbered document'}
                  </h3>
                  <p className="mt-2 text-sm">
                    {label(d.documentType)} · {d.registrationNumber} · {d.program}
                  </p>
                  <p className="mt-1 text-sm font-medium">{label(d.status)}</p>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Issuing institution</dt>
                      <dd className="break-words">{d.institution}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Approved issue date</dt>
                      <dd>{d.issueDate ?? 'Not supplied'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Issuance authority</dt>
                      <dd className="break-all">{d.authorityReference}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {privateRead && (
                      <a
                        className="inline-flex min-h-11 h-auto whitespace-normal items-center rounded-md border border-border px-4 text-sm font-medium text-brand"
                        href={`/api/v1/official-documents/${d.id}/file`}
                      >
                        Review private PDF
                      </a>
                    )}
                    {approve && d.status === 'PENDING_APPROVAL' && (
                      <Button
                        className="min-h-11 h-auto whitespace-normal"
                        disabled={d.generatedByUserId === user.id || operation.action.isPending}
                        onClick={() => {
                          operation.action.mutate(() => api.documentAction(d.id, 'approve'));
                        }}
                      >
                        Approve document
                      </Button>
                    )}
                    {issue && d.status === 'APPROVED' && (
                      <Button
                        className="min-h-11 h-auto whitespace-normal"
                        disabled={d.generatedByUserId === user.id || operation.action.isPending}
                        onClick={() => {
                          operation.action.mutate(async () => {
                            const receipt = await api.documentAction(d.id, 'issue');
                            setVerificationUrl(receipt.verificationUrl ?? '');
                          });
                        }}
                      >
                        Issue approved document
                      </Button>
                    )}
                    {revoke && d.status === 'ISSUED' && (
                      <Button
                        variant="outline"
                        className="min-h-11 h-auto whitespace-normal"
                        onClick={() => {
                          setRevoking(d.id);
                        }}
                      >
                        Revoke document
                      </Button>
                    )}
                  </div>
                  {revoking === d.id && (
                    <form
                      className="mt-4 flex flex-col gap-3 sm:flex-row"
                      onSubmit={(event) => {
                        submit(event, operation, async (data) =>
                          api.documentAction(d.id, 'revoke', text(data, 'reason')),
                        );
                      }}
                    >
                      <Field title="Revocation reason" name="reason" maxLength={500} />
                      <Button
                        type="submit"
                        className="min-h-11 h-auto whitespace-normal self-end"
                        disabled={operation.action.isPending}
                      >
                        Confirm revocation
                      </Button>
                    </form>
                  )}
                </article>
              ))
            ) : (
              <p className="p-5 text-sm">No official documents have been prepared.</p>
            )}
          </div>
          <Pagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
function ResultPanel({ initialResult }: { initialResult: string }) {
  const canWrite = useCan(PERMISSIONS.resultsWrite),
    canPublish = useCan(PERMISSIONS.resultsPublish),
    canRead = useCan(PERMISSIONS.resultsRead);
  const id = initialResult;
  const operation = useAction();
  const query = useQuery({
    queryKey: ['official', 'result', id],
    queryFn: () => resultReviewApi.get(id),
    enabled: !!id && canRead,
  });
  const result = query.data;
  const policies = useQuery({
    queryKey: ['official', 'result-policies', result?.programId],
    queryFn: () =>
      api.policies({
        service: 'result',
        programId: result?.programId,
        status: 'APPROVED',
        pageSize: 100,
      }),
    enabled: !!result,
  });
  return (
    <>
      <h2 className="text-lg font-semibold">Official result decisions and publication</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Open a result from the existing review queue. Record only university-supplied decisions,
        complete independent review, then publish to its student’s account.
      </p>
      <Button asChild variant="outline" className="mt-4 min-h-11 h-auto whitespace-normal">
        <Link href="/admin/results/review">Open result review queue</Link>
      </Button>
      {!id && (
        <p className="mt-5 text-sm">
          Choose “Record university decision” or “Manage approved publication” on a result’s review
          page.
        </p>
      )}
      {query.isFetching && id && <TableSkeleton />}
      {query.isError && <ErrorState error={query.error} />}
      {result && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <h3 className="text-lg font-semibold">{result.examinationName}</h3>
          <p className="mt-2 text-sm">
            {result.registrationNumber} · {result.studentName} ·{' '}
            {result.status.replaceAll('_', ' ')} · Version {result.version}
          </p>
          <Button asChild variant="outline" className="my-4 min-h-11 h-auto whitespace-normal">
            <Link href={`/admin/results/review/${result.id}`}>
              Review marks and approval history
            </Link>
          </Button>
          {policies.isError && <ErrorState error={policies.error} />}
          {policies.isPending && (
            <p role="status" className="my-4 text-sm">
              Loading result authority…
            </p>
          )}
          {policies.data && !policies.data.data.length && (
            <p className="my-4 text-sm">
              No approved result policy is available for this program. Open Policies to record the
              university’s authority and obtain independent approval.
            </p>
          )}
          {canWrite && result.status === 'DRAFT' && (
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                submit(event, operation, async (data) =>
                  api.attest(
                    id,
                    attestOfficialResultSchema.parse({
                      policyId: text(data, 'policyId'),
                      expectedVersion: result.version,
                      authorityReference: text(data, 'authorityReference'),
                      outcome: text(data, 'outcome'),
                      totalMarks: text(data, 'totalMarks') || null,
                      maxMarks: text(data, 'maxMarks') || null,
                      sgpa: text(data, 'sgpa') || null,
                      cgpa: text(data, 'cgpa') || null,
                      subjects: result.subjects.map((s) => ({
                        id: s.id,
                        status: text(data, `status-${s.id}`),
                        grade: text(data, `grade-${s.id}`) || null,
                      })),
                    }),
                  ),
                );
              }}
            >
              <Choice title="Approved result policy" name="policyId">
                {policies.data?.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.definition.institutionName} · {p.definition.authorizationReference}
                  </option>
                ))}
              </Choice>
              <Field title="Recorded academic decision reference" name="authorityReference" />
              <Choice title="Recorded result outcome" name="outcome">
                {['PASS', 'FAIL', 'BACKLOG', 'WITHHELD'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Choice>
              <Field
                title="Recorded total marks (optional)"
                name="totalMarks"
                required={false}
                defaultValue={result.totalMarks ?? ''}
              />
              <Field
                title="Recorded maximum marks (optional)"
                name="maxMarks"
                required={false}
                defaultValue={result.maxMarks ?? ''}
              />
              <Field
                title="Recorded GPA (optional)"
                name="sgpa"
                required={false}
                defaultValue={result.sgpa ?? ''}
              />
              <Field title="Recorded cumulative GPA (optional)" name="cgpa" required={false} />
              {result.subjects.map((s) => (
                <div
                  key={s.id}
                  className="grid gap-4 border-t border-border pt-4 sm:col-span-2 sm:grid-cols-2"
                >
                  <h4 className="font-medium sm:col-span-2">
                    {s.subjectCode} — {s.subjectName} · Marks {s.marks.totalMarks ?? 'not supplied'}
                  </h4>
                  <Choice title={`Recorded status for ${s.subjectCode}`} name={`status-${s.id}`}>
                    {['PASS', 'FAIL', 'ABSENT', 'BACKLOG', 'WITHHELD'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </Choice>
                  <Field
                    title={`Recorded grade for ${s.subjectCode} (optional)`}
                    name={`grade-${s.id}`}
                    required={false}
                    maxLength={8}
                    defaultValue={s.grade ?? ''}
                  />
                </div>
              ))}
              <label className="flex min-h-11 h-auto whitespace-normal items-center gap-3 text-sm sm:col-span-2">
                <input type="checkbox" required />
                These values are taken from the approved university decision; no grades have been
                inferred.
              </label>
              <Button
                type="submit"
                className="min-h-11 h-auto whitespace-normal w-fit"
                disabled={operation.action.isPending || !policies.data?.data.length}
              >
                Record decision for review
              </Button>
            </form>
          )}
          {canPublish && result.status === 'APPROVED' && result.publicationPolicyId && (
            <form
              className="mt-4 space-y-4"
              onSubmit={(event) => {
                submit(event, operation, async () =>
                  api.publish(id, {
                    policyId: result.publicationPolicyId,
                    expectedVersion: result.version,
                  }),
                );
              }}
            >
              <label className="flex min-h-11 h-auto whitespace-normal items-start gap-3 text-sm">
                <input type="checkbox" required className="mt-1" />I confirm this independently
                approved result may be released to this student’s private account.
              </label>
              <Button
                type="submit"
                className="min-h-11 h-auto whitespace-normal"
                disabled={operation.action.isPending}
              >
                Publish approved result
              </Button>
            </form>
          )}
          {canPublish && result.status === 'PUBLISHED' && (
            <Button
              variant="outline"
              className="min-h-11 h-auto whitespace-normal"
              disabled={operation.action.isPending}
              onClick={() => {
                operation.action.mutate(() => api.withdraw(id));
              }}
            >
              Withdraw published result
            </Button>
          )}
        </section>
      )}
      <Feedback operation={operation} />
      {id && (
        <Button
          variant="outline"
          className="mt-5 min-h-11 h-auto whitespace-normal"
          onClick={() => {
            void query.refetch();
          }}
        >
          Refresh result availability
        </Button>
      )}
    </>
  );
}
function AuditPanel() {
  const { page, setPage } = useOfficialList();
  const query = useQuery({ queryKey: ['official', 'audit', page], queryFn: () => api.audit(page) });
  return (
    <>
      <h2 className="text-lg font-semibold">Verification and issuance audit</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Append-only policy, document, result and public-check events. Public references and client
        addresses are stored as keyed hashes.
      </p>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <div className="mt-5 divide-y rounded-xl border border-border bg-card">
            {query.data.data.map((event) => (
              <article key={event.id} className="p-5">
                <h3 className="font-medium break-words">{label(event.action)}</h3>
                <p className="mt-2 text-sm">
                  {event.createdAt.replace('T', ' ').slice(0, 19)} UTC ·{' '}
                  {event.actor ?? 'Public or student request'}
                </p>
                <details className="mt-3 text-sm">
                  <summary className="min-h-11 h-auto whitespace-normal cursor-pointer text-brand">
                    View audit evidence
                  </summary>
                  <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-secondary p-3 text-xs">
                    {JSON.stringify(
                      {
                        recordType: event.entityType,
                        recordReference: event.entityId,
                        ...event.metadata,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </article>
            ))}
            {!query.data.data.length && (
              <p className="p-5 text-sm">No verification audit events are recorded.</p>
            )}
          </div>
          <Pagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
export function OfficialRecords({
  initialResult = '',
  initialRequest = '',
}: {
  initialResult?: string;
  initialRequest?: string;
}) {
  const { values, update } = useOfficialList();
  const read = useCan(PERMISSIONS.certificatesRead),
    audit = useCan(PERMISSIONS.auditRead);
  if (!read) return <ForbiddenState />;
  return (
    <>
      <PageHeader
        title="Official records"
        description="Controlled university policies, document issuance and private result publication."
      />
      <p className="mb-6 max-w-prose text-sm text-muted-foreground">
        Real disclosure stays disabled until the university approves its legal issuer, public fields
        and authorities. Draft proposals, templates and applications are never public proof.
      </p>
      <Tabs
        value={values.tab || (initialResult ? 'results' : 'documents')}
        onValueChange={(tab) => {
          update({ tab, service: '', type: '' });
        }}
      >
        <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-2 group-data-[orientation=horizontal]/tabs:h-auto">
          <TabsTrigger value="documents" className="min-h-11 h-auto whitespace-normal">
            Documents
          </TabsTrigger>
          <TabsTrigger value="policies" className="min-h-11 h-auto whitespace-normal">
            Policies
          </TabsTrigger>
          <TabsTrigger value="templates" className="min-h-11 h-auto whitespace-normal">
            Templates
          </TabsTrigger>
          <TabsTrigger value="results" className="min-h-11 h-auto whitespace-normal">
            Results
          </TabsTrigger>
          {audit && (
            <TabsTrigger value="audit" className="min-h-11 h-auto whitespace-normal">
              Audit
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="documents">
          <DocumentPanel key={values.type} initialRequest={initialRequest} />
        </TabsContent>
        <TabsContent value="policies">
          <PolicyPanel key={values.service} />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatePanel />
        </TabsContent>
        <TabsContent value="results">
          <ResultPanel initialResult={initialResult} />
        </TabsContent>
        {audit && (
          <TabsContent value="audit">
            <AuditPanel />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
