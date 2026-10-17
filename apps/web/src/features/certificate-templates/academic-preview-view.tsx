'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DownloadIcon, FileTextIcon, RefreshCwIcon } from 'lucide-react';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import {
  academicCertificateTypeSchema,
  academicFixtureSchema,
  type AcademicCertificateType,
  type AcademicFixture,
} from '@docversity/validation';
import { ErrorState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { certificateTemplatesApi } from './api';

const selectClass =
  'h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Phase 12C: synthetic academic certificate samples, separate from the training template above. */
export function AcademicTemplatesPreview() {
  const canPreview = useCan(PERMISSIONS.templatesWrite);
  const query = useQuery({
    queryKey: ['certificate-templates', 'academic'],
    queryFn: certificateTemplatesApi.academicList,
    enabled: canPreview,
  });
  const [type, setType] = useState<AcademicCertificateType>('COURSE_COMPLETION');
  const [fixture, setFixture] = useState<AcademicFixture>('standard');
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  if (!canPreview) return null;
  const template = query.data?.templates.find((t) => t.type === type);

  async function generate() {
    if (!template || pending) return;
    setPending(true);
    setError(null);
    setPreview(null);
    try {
      const file = await certificateTemplatesApi.academicPreview({
        type,
        version: template.version,
        fixture,
        disposition: 'inline',
      });
      if (mounted.current)
        setPreview({
          url: URL.createObjectURL(file.blob),
          filename: file.filename ?? `${template.id}-${fixture}-v${template.version}.pdf`,
        });
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    <section className="mt-10" aria-labelledby="academic-templates-heading">
      <h2 id="academic-templates-heading" className="text-section-title text-navy-950">
        Academic certificate samples
      </h2>
      <p className="mt-1 mb-5 max-w-3xl text-sm text-muted-foreground">
        Course Completion, Transcript, Provisional, Character and Migration layouts with an invented
        record at a fictitious institution. Which types a course may offer is decided per course
        under Course management, not here.
      </p>
      {query.isPending ? (
        <TableSkeleton rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
          <div className="rounded-xl border bg-card p-5 sm:p-6">
            <label htmlFor="academic-type" className="mb-2 block text-sm font-medium">
              Certificate type
            </label>
            <select
              id="academic-type"
              className={selectClass}
              value={type}
              disabled={pending}
              onChange={(e) => {
                const parsed = academicCertificateTypeSchema.safeParse(e.target.value);
                if (parsed.success) {
                  setType(parsed.data);
                  // Multipage stress samples exist for transcripts only.
                  if (
                    !query.data.fixtures.some(
                      (f) => f.id === fixture && f.certificateTypes.includes(parsed.data),
                    )
                  )
                    setFixture('standard');
                  setPreview(null);
                  setError(null);
                }
              }}
            >
              {query.data.templates.map((t) => (
                <option key={t.id} value={t.type}>
                  {t.title}
                </option>
              ))}
            </select>
            {template && (
              <p className="mt-3 text-sm text-muted-foreground">{template.description}</p>
            )}
            <label htmlFor="academic-fixture" className="mt-5 mb-2 block text-sm font-medium">
              Invented record
            </label>
            <select
              id="academic-fixture"
              className={selectClass}
              value={fixture}
              disabled={pending}
              onChange={(e) => {
                const parsed = academicFixtureSchema.safeParse(e.target.value);
                if (parsed.success) {
                  setFixture(parsed.data);
                  setPreview(null);
                  setError(null);
                }
              }}
            >
              {query.data.fixtures
                .filter((f) => f.certificateTypes.includes(type))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
            </select>
            <Button
              className="mt-4 min-h-11 w-full"
              disabled={pending}
              onClick={() => void generate()}
            >
              <RefreshCwIcon aria-hidden="true" />
              {pending ? 'Generating preview…' : 'Generate academic sample PDF'}
            </Button>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Every page is marked SAMPLE. Signature lines are blank and there is no QR code or
              verification credential.
            </p>
          </div>
          <div
            className="min-w-0 overflow-hidden rounded-xl border bg-card"
            aria-live="polite"
            aria-busy={pending}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <h3 className="font-semibold text-navy-950">{template?.title ?? 'Sample'}</h3>
              <span className="rounded-md bg-warning-soft px-2 py-1 text-xs font-medium text-warning-text">
                SAMPLE · NOT OFFICIAL
              </span>
            </div>
            {error ? (
              <div className="p-6">
                <p role="alert" className="text-sm text-danger-text">
                  {error}
                </p>
                <Button className="mt-4" variant="outline" onClick={() => void generate()}>
                  Try again
                </Button>
              </div>
            ) : preview ? (
              <>
                <div className="flex justify-end bg-muted/40 px-5 py-3">
                  <Button asChild variant="outline" className="min-h-11">
                    <a href={preview.url} download={preview.filename}>
                      <DownloadIcon aria-hidden="true" />
                      Download academic sample
                    </a>
                  </Button>
                </div>
                {/* Many phone browsers cannot show a PDF inside a frame; use the download there. */}
                <p className="px-5 py-4 text-sm text-muted-foreground sm:hidden">
                  Use Download academic sample to open the PDF on this device.
                </p>
                <iframe
                  src={preview.url}
                  title={`Synthetic ${template?.title ?? 'certificate'} PDF preview`}
                  className="hidden h-[680px] w-full bg-muted sm:block"
                />
              </>
            ) : (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <FileTextIcon aria-hidden="true" className="size-10 text-muted-foreground" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  Choose a certificate type and generate a watermarked sample PDF.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
