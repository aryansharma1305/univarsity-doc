'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileTextIcon, DownloadIcon, RefreshCwIcon } from 'lucide-react';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { PageHeader } from '@/components/data/page-header';
import { ErrorState, ForbiddenState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { marksheetTemplatesApi } from './api';

export function MarksheetTemplatesView() {
  const canPreview = useCan(PERMISSIONS.templatesWrite);
  const query = useQuery({
    queryKey: ['marksheet-templates'],
    queryFn: marksheetTemplatesApi.list,
    enabled: canPreview,
  });
  const [fixture, setFixture] = useState<'semester' | 'year' | 'stress'>('semester');
  const [preview, setPreview] = useState<{ url: string; filename: string; label: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null);
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
  async function generate() {
    const template = query.data?.templates[0];
    if (!template || pending) return;
    setPending(true);
    setError(null);
    setPreview(null);
    try {
      const file = await marksheetTemplatesApi.preview({
        templateId: template.id,
        version: template.version,
        fixture,
        disposition: 'inline',
      });
      if (mounted.current)
        setPreview({
          url: URL.createObjectURL(file.blob),
          filename: file.filename ?? `sample-marksheet-${fixture}-v1.pdf`,
          label: query.data?.fixtures.find((f) => f.id === fixture)?.label ?? 'Synthetic preview',
        });
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  if (!canPreview) return <ForbiddenState />;
  return (
    <>
      <PageHeader
        title="Marksheet templates"
        description="Review the document layout with invented sample data. These previews are never issued to students."
      />
      {query.isPending ? (
        <TableSkeleton rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
          <section
            className="rounded-xl border bg-card p-5 sm:p-6"
            aria-labelledby="template-heading"
          >
            <FileTextIcon className="mb-4 size-7 text-brand-700" aria-hidden="true" />
            <h2 id="template-heading" className="text-card-title text-navy-950">
              Academic statement
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A neutral, print-ready A4 layout for semester-wise and year-wise programs.
            </p>
            <dl className="my-6 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Version</dt>
                <dd className="font-medium">{query.data.templates[0]?.version} · Preview only</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Typography</dt>
                <dd>Noto Sans · embedded</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Paper</dt>
                <dd>A4 portrait</dd>
              </div>
            </dl>
            <label htmlFor="marksheet-fixture" className="mb-2 block text-sm font-medium">
              Synthetic example
            </label>
            <select
              id="marksheet-fixture"
              className="h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              value={fixture}
              disabled={pending}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'semester' || value === 'year' || value === 'stress') {
                  setFixture(value);
                  setPreview(null);
                  setError(null);
                }
              }}
            >
              {query.data.fixtures.map((f) => (
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
              {pending ? 'Generating preview…' : 'Generate sample PDF'}
            </Button>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Every page is marked SAMPLE. No real student lookup, institutional signature, seal or
              verification QR is available.
            </p>
          </section>
          <section
            className="min-w-0 overflow-hidden rounded-xl border bg-card"
            aria-labelledby="preview-heading"
            aria-busy={pending}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <h2 id="preview-heading" className="font-semibold text-navy-950">
                {preview?.label ?? 'Document preview'}
              </h2>
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
                <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    Fictitious institution and student · identical PDF for preview and download
                  </p>
                  <Button asChild variant="outline" className="min-h-11">
                    <a href={preview.url} download={preview.filename}>
                      <DownloadIcon aria-hidden="true" />
                      Download sample
                    </a>
                  </Button>
                </div>
                <iframe
                  src={preview.url}
                  title="Synthetic marksheet PDF preview"
                  className="h-[680px] w-full bg-muted"
                />
                <p className="px-5 py-3 text-xs text-muted-foreground">
                  If your browser cannot display PDFs, use Download sample to open the same
                  document.
                </p>
              </>
            ) : (
              <div
                className="flex min-h-[340px] flex-col items-center justify-center gap-3 px-6 py-12 text-center"
                role="status"
              >
                <FileTextIcon aria-hidden="true" className="size-10 text-muted-foreground" />
                <h3 className="font-medium text-navy-950">See the sample on paper</h3>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Choose an example and generate a watermarked PDF. All figures are supplied
                  synthetic values; no academic outcome is calculated.
                </p>
                {pending && <p className="text-sm text-muted-foreground">Preparing your sample…</p>}
              </div>
            )}
          </section>
        </div>
      )}
      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Official issuance awaits university-approved templates, GPA and passing policies,
        publication provenance and an authorized signing service. Existing student documents and
        results remain unchanged.
      </p>
    </>
  );
}
