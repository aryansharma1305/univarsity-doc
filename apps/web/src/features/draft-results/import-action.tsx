'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { draftResultsApi } from './api';
export function DraftImportAction({
  previewId,
  onSaved,
}: {
  previewId: string;
  onSaved: () => void;
}) {
  const canWrite = useCan(PERMISSIONS.resultsWrite);
  const [confirmed, setConfirmed] = useState(false);
  const [batchId, setBatch] = useState('');
  const plan = useMutation({
    mutationFn: () => draftResultsApi.plan(previewId),
    onSuccess: () => {
      setConfirmed(false);
      setBatch(crypto.randomUUID());
      save.reset();
    },
  });
  const save = useMutation({
    mutationFn: () => {
      if (!plan.data) throw new Error('Review a draft plan first.');
      return draftResultsApi.commit(previewId, {
        batchId,
        digest: plan.data.digest,
        confirmed: true,
      });
    },
    onSuccess: onSaved,
  });
  if (!canWrite) return null;
  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <h2 className="text-section-title">Save valid rows as drafts</h2>
      <p className="text-sm text-muted-foreground">
        Recheck enrollment, examination eligibility and marks before saving. Different existing
        marks require manual review; they will not be overwritten.
      </p>
      <Button
        variant="outline"
        disabled={plan.isPending || save.isPending}
        onClick={() => {
          plan.mutate();
        }}
      >
        {plan.isPending ? 'Checking current records…' : 'Review draft save plan'}
      </Button>
      {plan.isError && (
        <p role="alert" className="text-danger-text">
          {errorMessage(plan.error)}
        </p>
      )}
      {plan.data && !save.data && (
        <>
          <p role="status" className="text-sm">
            {plan.data.counts.created} to create · {plan.data.counts.updated} to update ·{' '}
            {plan.data.counts.skipped} to skip · {plan.data.counts.rejected} rejected.
          </p>
          <details className="text-sm">
            <summary>Review row outcomes</summary>
            <ul className="mt-3 max-h-72 space-y-2 overflow-auto">
              {plan.data.rows.map((r) => (
                <li key={r.rowNumber} className="break-words">
                  Row {r.rowNumber}: {r.action} — {r.message}
                </li>
              ))}
            </ul>
          </details>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
              }}
            />
            I confirm saving the listed valid rows as internal DRAFT records. Rejected rows will not
            be saved; no results will be published.
          </label>
          <Button
            disabled={
              !confirmed ||
              save.isPending ||
              plan.data.counts.created + plan.data.counts.skipped === 0
            }
            onClick={() => {
              save.mutate();
            }}
          >
            {save.isPending ? 'Saving drafts…' : 'Save Valid Rows as Drafts'}
          </Button>
        </>
      )}
      {save.isError && (
        <p role="alert" className="text-danger-text">
          {errorMessage(save.error)} Review a fresh plan if the records changed. A network failure
          may be retried with the same batch identifier.
        </p>
      )}
      {save.data && (
        <div role="status" className="space-y-2 text-sm">
          <p>
            Draft batch saved: {save.data.counts.created} created, {save.data.counts.updated}{' '}
            updated, {save.data.counts.skipped} skipped, {save.data.counts.rejected} rejected.
          </p>
          <p className="break-all">Batch: {save.data.batchId}</p>
          <Button asChild variant="outline">
            <Link href="/admin/results">View saved drafts</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
