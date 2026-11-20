'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatMoney,
  razorpayCheckoutReturnResultSchema,
  razorpayOrderViewSchema,
  studentRazorpayHistorySchema,
  type RazorpayOrderView,
  type StudentRazorpayHistory,
} from '@docversity/validation';
import { ApiError, studentRequest } from '@/lib/api';

/** Exact Razorpay Standard Checkout script (CSP allows only Razorpay's own hosts, src/lib/csp.ts). */
export const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface CheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface CheckoutInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: () => void) => void;
}
type CheckoutConstructor = new (options: Record<string, unknown>) => CheckoutInstance;
declare global {
  interface Window {
    Razorpay?: CheckoutConstructor;
  }
}

let loading: Promise<CheckoutConstructor> | null = null;
/** Loads checkout.js once; a failure is retried on the next click. */
export function loadCheckout(): Promise<CheckoutConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise<CheckoutConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error('checkout unavailable'));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('checkout unavailable'));
    };
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

type Phase =
  | 'IDLE'
  | 'CREATING'
  | 'OPEN'
  | 'VERIFYING'
  | 'AWAITING_CONFIRMATION'
  | 'CANCELLED'
  | 'FAILED'
  | 'UNAVAILABLE'
  | 'NETWORK';
const MESSAGES: Record<Phase, string> = {
  IDLE: '',
  CREATING: 'Preparing a secure test checkout…',
  OPEN: 'Checkout is open. Complete or close it to continue.',
  VERIFYING: 'Checking the payment response…',
  AWAITING_CONFIRMATION:
    'Payment response received. Waiting for confirmation from Razorpay; this page updates when it arrives. Do not pay again.',
  CANCELLED: 'Checkout was closed. Nothing was charged by Docversity; you can try again.',
  FAILED: 'The payment did not go through. You can try again with another test method.',
  UNAVAILABLE: 'Online payment is not available for this payment right now.',
  NETWORK: 'We could not reach the payment service. Check your connection and try again.',
};
const STATE_LABELS: Record<StudentRazorpayHistory['orders'][number]['paymentState'], string> = {
  PENDING: 'Awaiting payment or confirmation',
  PAID: 'Paid (awaiting staff verification)',
  RECONCILIATION_REQUIRED: 'Under review by the payments office',
  FAILED: 'Could not be started',
  ABANDONED: 'Closed (not paid)',
};

/**
 * Razorpay TEST-mode Standard Checkout for one re-exam obligation. The server creates the order with
 * the obligation's own amount; the browser receives only the public key id and order id. Returning
 * from checkout never marks anything paid: only the signed webhook does.
 */
export function RazorpayOrderCheckout({ paymentId }: { paymentId: string }) {
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [history, setHistory] = useState<StudentRazorpayHistory | null>(null);
  const busy = useRef(false);

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    let active = true;
    studentRequest(
      'GET',
      `student/re-exam-payments/${paymentId}/razorpay`,
      studentRazorpayHistorySchema,
    )
      .then((next) => {
        if (active) setHistory(next);
      })
      .catch(() => {
        /* History is informational; the payment page stays authoritative. */
      });
    return () => {
      active = false;
    };
  }, [paymentId, version]);

  const pay = async () => {
    if (busy.current) return; // duplicate-click guard (state updates are async)
    busy.current = true;
    setPhase('CREATING');
    let order: RazorpayOrderView;
    let Checkout: CheckoutConstructor;
    try {
      order = await studentRequest(
        'POST',
        `student/re-exam-payments/${paymentId}/razorpay-order`,
        razorpayOrderViewSchema,
      );
      Checkout = await loadCheckout();
    } catch (error) {
      busy.current = false;
      setPhase(
        error instanceof ApiError && [404, 409].includes(error.status) ? 'UNAVAILABLE' : 'NETWORK',
      );
      return;
    }
    const done = (next: Phase) => {
      busy.current = false;
      setPhase(next);
      refresh();
    };
    const checkout = new Checkout({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountMinor,
      currency: order.currency,
      name: 'Docversity (TEST)',
      description: 'Re-exam fee: Razorpay test mode, no real money',
      // No prefill: the student types any details into Razorpay's own form.
      handler: (response: CheckoutResponse) => {
        setPhase('VERIFYING');
        studentRequest(
          'POST',
          `student/re-exam-payments/${paymentId}/razorpay-return`,
          razorpayCheckoutReturnResultSchema,
          { body: response },
        )
          .then(() => {
            done('AWAITING_CONFIRMATION');
          })
          .catch(() => {
            // The webhook still decides; tell the student not to pay twice.
            done('AWAITING_CONFIRMATION');
          });
      },
      modal: {
        ondismiss: () => {
          done('CANCELLED');
        },
      },
    });
    checkout.on('payment.failed', () => {
      done('FAILED');
    });
    setPhase('OPEN');
    checkout.open();
  };

  const paid = history?.orders.filter((o) => o.paymentState === 'PAID') ?? [];
  const working = ['CREATING', 'OPEN', 'VERIFYING'].includes(phase);
  const locked = paid.length > 0 || phase === 'AWAITING_CONFIRMATION';
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Razorpay TEST mode: use Razorpay&apos;s test cards or test UPI only. No real money moves.
      </p>
      {!locked && (
        <button
          type="button"
          onClick={() => void pay()}
          disabled={working}
          aria-busy={working}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-navy-900 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {working ? 'Please wait…' : 'Pay online (TEST)'}
        </button>
      )}
      <p
        role={['FAILED', 'NETWORK', 'UNAVAILABLE'].includes(phase) ? 'alert' : 'status'}
        aria-live="polite"
        className="text-sm text-navy-950"
      >
        {MESSAGES[phase]}
      </p>
      {paid.map((o) => (
        <div
          key={o.attempt}
          role="note"
          className="rounded-lg border border-border bg-muted p-3 text-sm break-words text-navy-950"
        >
          <p className="font-semibold">Acknowledgement (not an official receipt)</p>
          <p>
            Razorpay TEST payment {o.providerPaymentId} for order {o.providerOrderId} —{' '}
            {formatMoney(o.amountMinor, o.currency)}. The university&apos;s staff still verify it.
          </p>
        </div>
      ))}
      {history && history.orders.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer">Online payment attempts</summary>
          <ol className="mt-2 space-y-1">
            {history.orders.map((o) => (
              <li key={o.attempt} className="break-words">
                Attempt {o.attempt}: {STATE_LABELS[o.paymentState]} ·{' '}
                {formatMoney(o.amountMinor, o.currency)} ·{' '}
                {new Date(o.createdAt).toLocaleString('en-IN')}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
