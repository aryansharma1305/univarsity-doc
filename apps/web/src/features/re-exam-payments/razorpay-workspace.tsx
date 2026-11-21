'use client';
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import {
  formatMoney,
  razorpayWorkspaceSchema,
  toMinorUnits,
  type RazorpayWorkspace,
} from '@docversity/validation';
import { useCan } from '@/components/providers/session-context';
import { ApiError, apiRequest, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const decisionSchema = z.object({ id: z.uuid(), status: z.string() });
const key = (paymentId: string) => ['re-exam-payments', 'razorpay', paymentId] as const;

/**
 * Razorpay TEST workspace on the staff payment page: orders with their derived payment and refund
 * states, maker-checker refunds and the audit trail. Renders nothing when Razorpay is off (404).
 */
export function RazorpayWorkspacePanel({ paymentId }: { paymentId: string }) {
  const headingId = useId();
  const canAct = useCan(PERMISSIONS.reExamPaymentsVerify);
  const canDecide = useCan(PERMISSIONS.reExamPaymentsRefundApprove);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key(paymentId),
    queryFn: () =>
      apiRequest(
        'GET',
        `payment-buttons/razorpay/re-exam-payments/${paymentId}`,
        razorpayWorkspaceSchema,
      ),
    retry: (count, error) => !(error instanceof ApiError && error.isNotFound) && count < 2,
  });
  const act = useMutation({
    mutationFn: (input: { path: string; body?: unknown }) =>
      apiRequest('POST', input.path, decisionSchema, { body: input.body }),
    onSuccess: (result) => {
      toast.success(`Refund ${result.status.toLowerCase().replaceAll('_', ' ')}.`);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key(paymentId) });
    },
  });
  const data = query.data;
  if (!data) return null;
  return (
    <section aria-labelledby={headingId} className="space-y-4 rounded-lg border border-border p-4">
      <h2 id={headingId} className="text-base font-semibold text-navy-950">
        Razorpay (TEST mode)
      </h2>
      <p className="text-sm text-muted-foreground">
        Test-mode records only; no real money. Refunds: {REFUND_POLICY[data.refunds]}.
      </p>
      {data.orders.length === 0 && <p className="text-sm">No online payment attempt yet.</p>}
      {data.orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          policy={data.refunds}
          canAct={canAct}
          busy={act.isPending}
          onRequest={(body) => {
            act.mutate({
              path: `payment-buttons/razorpay/re-exam-payments/${paymentId}/refunds`,
              body,
            });
          }}
        />
      ))}
      {data.refundCandidates.length > 0 && (
        <div
          role="note"
          className="rounded-md border border-warning/40 bg-warning-soft p-3 text-sm"
        >
          <h3 className="font-semibold">Captures to return (refund candidates)</h3>
          <ul className="mt-2 space-y-2">
            {data.refundCandidates.map((c) => (
              <li key={c.providerPaymentId} className="break-words">
                <span className="font-mono text-xs">{c.providerPaymentId}</span> ·{' '}
                {formatMoney(c.amountMinor, c.currency)} · {c.reason} · refundable{' '}
                {formatMoney(c.refundableMinor, c.currency)}
                {canAct && data.refunds !== 'off' && c.refundableMinor > 0 && (
                  <Button
                    size="sm"
                    className="ml-2"
                    disabled={act.isPending}
                    onClick={() => {
                      act.mutate({
                        path: `payment-buttons/razorpay/re-exam-payments/${paymentId}/refunds`,
                        body: {
                          providerPaymentId: c.providerPaymentId,
                          reason: 'REFUND_CANDIDATE',
                        },
                      });
                    }}
                  >
                    Request refund
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.refundRequests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Refunds</h3>
          <ul className="mt-2 space-y-2">
            {data.refundRequests.map((r) => (
              <li key={r.id} className="rounded-md border border-border p-3 text-sm break-words">
                <p>
                  {formatMoney(r.amountMinor, r.currency)} · {r.reason} ·{' '}
                  <strong>{r.status}</strong>
                  {r.source === 'DASHBOARD' ? ' · made in the Razorpay dashboard' : ''}
                  {r.failureReason ? ` (${r.failureReason})` : ''}
                </p>
                <p className="text-muted-foreground">
                  {r.source === 'DASHBOARD'
                    ? 'Recorded'
                    : `Requested by ${r.requestedBy?.name ?? '—'}`}{' '}
                  on {formatDateTime(r.createdAt)}
                  {r.approvedBy ? ` · decided by ${r.approvedBy.name}` : ''}
                  {r.providerRefundId ? ` · ${r.providerRefundId}` : ''}
                </p>
                {canDecide && r.status === 'REQUESTED' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() => {
                        act.mutate({ path: `payment-buttons/razorpay/refunds/${r.id}/approve` });
                      }}
                    >
                      Approve and send refund
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={act.isPending}
                      onClick={() => {
                        act.mutate({ path: `payment-buttons/razorpay/refunds/${r.id}/reject` });
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {canDecide && r.status === 'SENDING' && r.failureReason && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <p className="w-full text-xs text-muted-foreground">
                      Razorpay refused this refund. Each action first asks Razorpay whether it
                      exists.
                    </p>
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() => {
                        act.mutate({
                          path: `payment-buttons/razorpay/refunds/${r.id}/resolve`,
                          body: { action: 'RETRY' },
                        });
                      }}
                    >
                      Look up and retry
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={act.isPending}
                      onClick={() => {
                        act.mutate({
                          path: `payment-buttons/razorpay/refunds/${r.id}/resolve`,
                          body: { action: 'MARK_FAILED' },
                        });
                      }}
                    >
                      Look up and mark failed
                    </Button>
                  </div>
                )}
                {canDecide && ['APPROVED', 'SENDING'].includes(r.status) && !r.failureReason && (
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={act.isPending}
                    onClick={() => {
                      act.mutate({ path: `payment-buttons/razorpay/refunds/${r.id}/approve` });
                    }}
                  >
                    Retry sending
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            A refund needs a second person with refund-approval rights: the requester cannot approve
            or reject it.
          </p>
        </div>
      )}
      {data.audit.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer">Audit trail ({data.audit.length})</summary>
          <ol className="mt-2 space-y-1">
            {data.audit.map((a, index) => (
              <li key={`${a.createdAt}-${String(index)}`} className="break-words">
                {formatDateTime(a.createdAt)} · {a.action}
                {a.actor ? ` · ${a.actor}` : ''}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

const REFUND_POLICY: Record<RazorpayWorkspace['refunds'], string> = {
  off: 'disabled (no university refund policy configured)',
  full_only: 'full refunds only',
  partial: 'full or partial refunds',
};
const PAYMENT_STATE: Record<RazorpayWorkspace['orders'][number]['paymentState'], string> = {
  PENDING: 'Pending',
  PAID: 'Paid (captured, amount exact)',
  RECONCILIATION_REQUIRED: 'Reconciliation required',
  FAILED: 'Failed',
  ABANDONED: 'Abandoned',
};

function OrderCard({
  order,
  policy,
  canAct,
  busy,
  onRequest,
}: {
  order: RazorpayWorkspace['orders'][number];
  policy: RazorpayWorkspace['refunds'];
  canAct: boolean;
  busy: boolean;
  onRequest: (body: { amountMinor?: number; reason: string }) => void;
}) {
  const amountId = useId();
  const reasonId = useId();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const refundable = canAct && policy !== 'off' && order.refundableMinor > 0;
  return (
    <div className="rounded-md border border-border p-3 text-sm break-words">
      <p>
        Attempt {order.attempt} · <strong>{PAYMENT_STATE[order.paymentState]}</strong> · refund:{' '}
        {order.refundState.replaceAll('_', ' ').toLowerCase()} ·{' '}
        {formatMoney(order.amountMinor, order.currency)}
      </p>
      <p className="font-mono text-xs">
        {order.providerOrderId ?? 'no order id'} · {order.providerPaymentId ?? 'no payment'}
      </p>
      {order.events.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {order.events.map((e) => `${e.kind}${e.reason ? ` (${e.reason})` : ''}`).join(' → ')}
        </p>
      )}
      {refundable && (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-3 sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const minor = amount ? toMinorUnits(amount, order.currency) : undefined;
            if (minor === null) {
              toast.error('Enter a valid amount.');
              return;
            }
            onRequest({ ...(minor === undefined ? {} : { amountMinor: minor }), reason });
          }}
        >
          {policy === 'partial' && (
            <div>
              <Label htmlFor={amountId}>Refund amount (blank = remaining)</Label>
              <Input
                id={amountId}
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                }}
              />
            </div>
          )}
          <div>
            <Label htmlFor={reasonId}>Reason code</Label>
            <Input
              id={reasonId}
              required
              pattern="[A-Z][A-Z_]{2,47}"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value.toUpperCase());
              }}
            />
          </div>
          <Button type="submit" disabled={busy}>
            Request refund
          </Button>
        </form>
      )}
    </div>
  );
}
