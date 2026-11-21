'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { AlertTriangleIcon, CheckIcon, EyeIcon, InfoIcon, PrinterIcon, XIcon } from 'lucide-react';
import QRCode from 'qrcode';
import type {
  OfficialVerificationResponse,
  PublicVerificationService,
} from '@docversity/validation';
import crest from './university-logo.webp';
import styles from './verification-result.module.css';

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';
type Result = NonNullable<OfficialVerificationResponse['results']>[number];

const ICONS: Record<Tone, ReactNode> = {
  success: <CheckIcon aria-hidden="true" className="size-7" strokeWidth={3} />,
  info: <CheckIcon aria-hidden="true" className="size-7" strokeWidth={3} />,
  warning: <AlertTriangleIcon aria-hidden="true" className="size-6" />,
  danger: <XIcon aria-hidden="true" className="size-7" strokeWidth={3} />,
  neutral: <InfoIcon aria-hidden="true" className="size-6" />,
};

export function VerificationStatusBanner({
  tone,
  title,
  message,
}: {
  tone: Tone;
  title: string;
  message: string;
}) {
  return (
    <div className={`${styles.banner} ${styles[tone]}`}>
      <span className={styles.bannerIcon}>{ICONS[tone]}</span>
      <div>
        <h2 className={styles.bannerTitle}>{title}</h2>
        <p className={styles.bannerText}>{message}</p>
      </div>
    </div>
  );
}

export function StatusBadge({
  tone,
  label,
  large = false,
}: {
  tone: Tone;
  label: string;
  large?: boolean;
}) {
  return (
    <span className={`${styles.badge} ${styles[tone]} ${large ? styles.pill : ''}`}>{label}</span>
  );
}

/** A real, scannable QR of a genuine verification link (only ever built from a held credential). */
export function VerificationQRCode({ url, caption }: { url: string; caption: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(url, { margin: 1, width: 256, errorCorrectionLevel: 'M' }).then(
      (value) => {
        if (live) setSrc(value);
      },
    );
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <figure className={styles.qr}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- generated data URL
        <img src={src} alt="Verification QR code" width={128} height={128} />
      ) : (
        <span className="size-32" aria-hidden="true" />
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** Left panel: the institution crest (student photos are never disclosed publicly) and status. */
export function VerificationIdentityPanel({ children }: { children: ReactNode }) {
  return (
    <div className={styles.identity}>
      <div className={styles.portrait}>
        <Image src={crest} alt="University crest" width={485} height={512} sizes="12rem" />
      </div>
      {children}
    </div>
  );
}

export function VerificationDetailsTable({
  heading,
  rows,
}: {
  heading: string;
  rows: readonly (readonly [string, ReactNode | undefined | null])[];
}) {
  const shown = rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
  return (
    <section className={styles.details} aria-label={heading}>
      <h3 className={styles.detailsTitle}>{heading}</h3>
      <table>
        <tbody>
          {shown.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Everything inside prints alone (see globals.css `[data-print-area]`). */
export function VerificationPrintView({ children }: { children: ReactNode }) {
  return (
    <div className={styles.wrap} data-print-area>
      {children}
    </div>
  );
}

/** Left identity panel, right details; `wide` content (a marks table) spans both columns. */
function Card({
  left,
  right,
  wide,
  actions,
}: {
  left: ReactNode;
  right: ReactNode;
  wide?: ReactNode;
  actions?: ReactNode;
}) {
  const buttons = actions && <div className={`${styles.actions} print:hidden`}>{actions}</div>;
  return (
    <div className={styles.card}>
      {left}
      <div className="min-w-0">
        {right}
        {!wide && buttons}
      </div>
      {wide && (
        <div className={styles.wide}>
          {wide}
          {buttons}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  primary = false,
  icon,
  children,
  onClick,
  disabled,
}: {
  primary?: boolean;
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={primary ? styles.primary : styles.secondary}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  );
}

const print = () => {
  window.print();
};
const PrintIcon = <PrinterIcon aria-hidden="true" className="size-5" />;
const ViewIcon = <EyeIcon aria-hidden="true" className="size-5" />;
const titleCase = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');

const REGISTRATION_TONES: Record<string, Tone> = {
  ACTIVE: 'success',
  COMPLETED: 'info',
  SUSPENDED: 'neutral',
  REVOKED: 'danger',
};
/** "Expired" is shown for completeness of the legend; Docversity records no expiry state. */
const LEGEND: readonly [string, Tone][] = [
  ['Active', 'success'],
  ['Completed', 'info'],
  ['Expired', 'warning'],
  ['Suspended', 'neutral'],
  ['Revoked', 'danger'],
];

function RegistrationResult({ response }: { response: OfficialVerificationResponse }) {
  const d = response.details ?? {};
  const status = response.recordStatus ?? (response.status === 'ACTIVE' ? 'ACTIVE' : undefined);
  const tone = status ? (REGISTRATION_TONES[status] ?? 'neutral') : 'success';
  return (
    <VerificationPrintView>
      <VerificationStatusBanner tone={tone} title="Registration Found" message={response.message} />
      <Card
        left={
          <VerificationIdentityPanel>
            {status && (
              <div className={`${styles.panelBox} ${styles[tone]}`}>
                <p className={styles.panelLabel}>Registration Status</p>
                <p className={styles.bigStatus}>
                  <span className={styles.dot} aria-hidden="true" />
                  {status}
                </p>
              </div>
            )}
            <div className={`${styles.panelBox} print:hidden`}>
              <p className={styles.panelLabel}>Status Options</p>
              <ul className={styles.legend}>
                {LEGEND.map(([label, legendTone]) => (
                  <li
                    key={label}
                    aria-current={label.toUpperCase() === status ? 'true' : undefined}
                    className={styles[legendTone]}
                  >
                    <span className={styles.dot} aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </VerificationIdentityPanel>
        }
        right={
          <VerificationDetailsTable
            heading="Student Information"
            rows={[
              ['Student Name', d.studentName],
              ['Registration No.', d.registrationNumber ?? response.maskedReference],
              ['Registration Date', d.registrationDate],
              ['Course', d.program ?? response.program],
              ['Admission Date', d.admissionDate],
              ['Course Duration', d.courseDuration],
              ['Course Level', d.courseLevel],
              ['Course Completion Date', d.completionDate],
              ['Academic Session', d.academicSession],
              ['School Name', d.school],
              ['Registration Status', status && <StatusBadge tone={tone} label={status} />],
            ]}
          />
        }
        actions={
          <ActionButton primary icon={PrintIcon} onClick={print}>
            Print Registration Card
          </ActionButton>
        }
      />
    </VerificationPrintView>
  );
}

function DocumentResult({
  service,
  response,
  token,
  onView,
  viewing,
}: {
  service: 'certificate' | 'admission-letter';
  response: OfficialVerificationResponse;
  token: string;
  onView: () => void;
  viewing: boolean;
}) {
  const d = response.details ?? {};
  const revoked = response.status === 'REVOKED';
  const certificate = service === 'certificate';
  const tone: Tone = revoked ? 'danger' : 'success';
  const badge = revoked ? 'REVOKED' : 'VALID';
  const reference = response.maskedReference;
  const verifyUrl =
    token && typeof window !== 'undefined'
      ? `${window.location.origin}/verify/${service}#token=${token}`
      : '';
  return (
    <VerificationPrintView>
      <VerificationStatusBanner
        tone={tone}
        title={
          revoked
            ? certificate
              ? 'Certificate Revoked'
              : 'Admission Letter Revoked'
            : certificate
              ? 'Certificate Valid'
              : 'Admission Letter Verified'
        }
        message={
          revoked
            ? response.message
            : certificate
              ? `This certificate is genuine and issued by ${response.institution ?? 'the institution'}.`
              : `This admission letter is authentic and was issued by ${response.institution ?? 'the institution'}.`
        }
      />
      <Card
        left={
          <VerificationIdentityPanel>
            <StatusBadge tone={tone} label={badge} large />
            {reference && (
              <dl className={styles.reference}>
                <dt className="text-sm text-muted-foreground">
                  {certificate ? 'Certificate No.' : 'Letter No.'}
                </dt>
                <dd>{reference}</dd>
              </dl>
            )}
            {verifyUrl && !revoked && (
              <VerificationQRCode
                url={verifyUrl}
                caption={`Scan to verify this ${certificate ? 'certificate' : 'admission letter'}`}
              />
            )}
          </VerificationIdentityPanel>
        }
        right={
          <VerificationDetailsTable
            heading={certificate ? 'Certificate Details' : 'Admission Letter Details'}
            rows={[
              [certificate ? 'Student Name' : 'Issued To', d.studentName],
              ['Registration No.', d.registrationNumber],
              ['Letter No.', certificate ? undefined : reference],
              ['Course Name', d.program ?? response.program],
              ['Course Level', d.courseLevel],
              ['Course Duration', d.courseDuration],
              ['School Name', d.school],
              [
                certificate ? 'Certificate Issue Date' : 'Letter Issue Date',
                d.issueDate ?? response.issueDate,
              ],
              ['Certificate Type', d.certificateType && titleCase(d.certificateType)],
              [
                certificate ? 'Certificate Status' : 'Letter Status',
                <StatusBadge key="s" tone={tone} label={badge} />,
              ],
              ['Institute Name', response.institution],
            ]}
          />
        }
        actions={
          <>
            {response.documentAccess && !revoked && (
              <ActionButton primary icon={ViewIcon} onClick={onView} disabled={viewing}>
                {viewing ? 'Opening…' : certificate ? 'View Certificate' : 'View Admission Letter'}
              </ActionButton>
            )}
            <ActionButton icon={PrintIcon} onClick={print}>
              Print Verification
            </ActionButton>
          </>
        }
      />
      {!response.documentAccess && !revoked && (
        <p className={styles.note}>
          The document itself stays private. Scan the QR code printed on the original to view it
          where the university allows.
        </p>
      )}
    </VerificationPrintView>
  );
}

const periodLabel = (structure: 'SEMESTER' | 'YEAR', n: number) =>
  structure === 'YEAR' ? `Year ${String(n)}` : `Semester ${String(n)}`;

export function ResultMarksheetTable({ result }: { result: Result }) {
  const totals = result.subjects.reduce(
    (sum, s) => ({
      obtained: sum.obtained + Number(s.totalMarks ?? 0),
      max: sum.max + Number(s.maxMarks ?? 0),
      complete: sum.complete && s.totalMarks !== null && s.maxMarks !== null,
    }),
    { obtained: 0, max: 0, complete: true },
  );
  return (
    <div
      className={styles.marks}
      role="region"
      aria-label={`${result.examination} subject marks`}
      // Keyboard users must be able to scroll wide tables (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <table>
        <caption className="sr-only">Published subject marks and grades</caption>
        <thead>
          <tr>
            <th scope="col">Subject Code</th>
            <th scope="col">Subject Name</th>
            <th scope="col" className={styles.num}>
              Maximum Marks
            </th>
            <th scope="col" className={styles.num}>
              Obtained Marks
            </th>
            <th scope="col">Grade</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {result.subjects.map((s) => (
            <tr key={s.programSubjectId}>
              <td>{s.code}</td>
              <th scope="row" className="font-medium">
                {s.name}
              </th>
              <td className={styles.num}>{s.maxMarks ?? '—'}</td>
              <td className={styles.num}>{s.totalMarks ?? '—'}</td>
              <td>{s.grade ?? '—'}</td>
              <td>{titleCase(s.status)}</td>
            </tr>
          ))}
        </tbody>
        {totals.complete && totals.max > 0 && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Total
              </th>
              <td className={styles.num}>{totals.max}</td>
              <td className={styles.num}>{totals.obtained}</td>
              <td colSpan={2}>
                {result.sgpa
                  ? `SGPA ${result.sgpa}`
                  : `${((totals.obtained / totals.max) * 100).toFixed(2)}%`}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function ResultResult({ response }: { response: OfficialVerificationResponse }) {
  const d = response.details ?? {};
  const results = response.results ?? [];
  const sheet = results[0];
  const outcome = d.outcome ?? sheet?.outcome ?? undefined;
  const tone: Tone = outcome === 'FAIL' || outcome === 'WITHHELD' ? 'warning' : 'success';
  return (
    <VerificationPrintView>
      <VerificationStatusBanner
        tone="success"
        title={sheet ? 'Marksheet Verified' : 'Result Published'}
        message={response.message}
      />
      <Card
        left={
          <VerificationIdentityPanel>
            {outcome ? (
              <div className={`${styles.panelBox} ${styles[tone]}`}>
                <p className={styles.panelLabel}>Result Status</p>
                <p className={styles.bigStatus}>
                  <span className={styles.dot} aria-hidden="true" />
                  {outcome}
                </p>
              </div>
            ) : (
              <StatusBadge tone="success" label="PUBLISHED" large />
            )}
            {sheet?.verificationUrl && (
              <VerificationQRCode
                url={sheet.verificationUrl}
                caption="Scan to verify this marksheet"
              />
            )}
          </VerificationIdentityPanel>
        }
        right={
          <VerificationDetailsTable
            heading={sheet ? 'Marksheet' : 'Result Information'}
            rows={[
              ['Institution', response.institution],
              ['Student Name', d.studentName],
              ['Course Name', d.program],
              ['Roll Number', d.rollNumber],
              ['Semester', d.period && periodLabel(d.period.structure, d.period.number)],
              ['Academic Session', d.academicSession],
              ['Examination', d.examination ?? sheet?.examination],
              ['Result Status', outcome && <StatusBadge key="o" tone={tone} label={outcome} />],
              ['Published On', sheet?.publishedAt.slice(0, 10)],
            ]}
          />
        }
        wide={
          results.length > 0 && results.map((r) => <ResultMarksheetTable key={r.id} result={r} />)
        }
        actions={
          sheet ? (
            <ActionButton primary icon={PrintIcon} onClick={print}>
              Print Marksheet
            </ActionButton>
          ) : (
            <ActionButton icon={PrintIcon} onClick={print}>
              Print Verification
            </ActionButton>
          )
        }
      />
      {!sheet && (
        <p className={styles.note}>
          Marks are never shown for a course, roll number and semester alone. Scan the QR code on
          the official marksheet to view the full marksheet where the university allows.
        </p>
      )}
    </VerificationPrintView>
  );
}

const FOUND = new Set(['VALID', 'ISSUED', 'ACTIVE', 'INACTIVE', 'REVOKED']);

/** Picks the right result card; unverified outcomes get a neutral banner and no details. */
export function VerificationResult({
  service,
  response,
  token,
  onView,
  viewing,
}: {
  service: PublicVerificationService;
  response: OfficialVerificationResponse;
  token: string;
  onView: () => void;
  viewing: boolean;
}) {
  if (!FOUND.has(response.status))
    return (
      <div className={styles.wrap}>
        <VerificationStatusBanner
          tone={response.status === 'UNAVAILABLE' ? 'warning' : 'neutral'}
          title={
            response.status === 'UNAVAILABLE'
              ? 'Verification not available'
              : response.status === 'AUTHENTICATION_REQUIRED'
                ? 'Sign in required'
                : response.status === 'UNPUBLISHED'
                  ? 'No published result'
                  : 'No verified record found'
          }
          message={response.message}
        />
      </div>
    );
  if (service === 'registration') return <RegistrationResult response={response} />;
  if (service === 'result') return <ResultResult response={response} />;
  return (
    <DocumentResult
      service={service}
      response={response}
      token={token}
      onView={onView}
      viewing={viewing}
    />
  );
}
