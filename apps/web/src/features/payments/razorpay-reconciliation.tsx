'use client';
import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import {
  RAZORPAY_BUTTONS,
  formatMoney,
  razorpayReceiptsSchema,
  razorpayReconciliationSchema,
} from '@docversity/validation';
import { apiRequest, errorMessage } from '@/lib/api';

/** Parent renders this only for staff who can verify payments; API enforces that permission too. */
export function RazorpayReconciliation({ paymentId }: { paymentId: string }) {
  const id = useId();
  const client = useQueryClient();
  const [receiptId, setReceipt] = useState('');
  const [reportReference, setReport] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['razorpay-receipts', paymentId],
    queryFn: () =>
      apiRequest('GET', `payment-buttons/re-exam/${paymentId}/receipts`, razorpayReceiptsSchema),
  });
  if (!query.data?.reconciliationAvailable || query.data.data.length === 0) return null;
  return (
    <section aria-labelledby={id} className="rounded-lg border bg-card p-5">
      <h2 id={id} className="text-lg font-semibold">
        Razorpay reconciliation (test only)
      </h2>
      <p className="mt-2 text-sm">
        Signed evidence alone does not identify the student or service. Check the university’s
        provider report against this student and application. Do not rely on a screenshot, email
        address or checkout return.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirmed || pending) return;
          setPending(true);
          setError(null);
          void apiRequest('POST', 'payment-buttons/reconcile', razorpayReconciliationSchema, {
            body: {
              receiptId,
              paymentId,
              buttonId: RAZORPAY_BUTTONS.RE_EXAM.id,
              reportReference,
              confirmedStudentOwnership: true,
              confirmedAgainstProviderRecords: true,
            },
          })
            .then(async () => {
              await client.invalidateQueries({ queryKey: ['re-exam-payments'] });
            })
            .catch((err: unknown) => {
              setError(errorMessage(err));
            })
            .finally(() => {
              setPending(false);
            });
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          Signed provider event
          <select
            required
            value={receiptId}
            onChange={(event) => {
              setReceipt(event.target.value);
            }}
            className="min-h-11 rounded-md border bg-card px-3"
          >
            <option value="">Select evidence</option>
            {query.data.data.map((receipt) => (
              <option
                key={receipt.id}
                value={receipt.id}
                disabled={!receipt.captured || receipt.amountRefunded > 0}
              >
                {receipt.eventType} · {formatMoney(receipt.amountMinor, receipt.currency)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-report`} className="flex flex-col gap-2 text-sm">
          Provider report reference
          <Input
            id={`${id}-report`}
            value={reportReference}
            minLength={6}
            maxLength={128}
            required
            onChange={(event) => {
              setReport(event.target.value);
            }}
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.target.checked);
            }}
          />
          I verified the receiving merchant, the re-exam button, the full amount and currency, and
          this student’s ownership in actual provider records.
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending || !confirmed || !receiptId || reportReference.trim().length < 6}
        >
          {pending ? 'Reconciling…' : 'Reconcile verified provider payment'}
        </Button>
      </form>
    </section>
  );
}
