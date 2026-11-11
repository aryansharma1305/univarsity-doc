'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  PAYMENT_BUTTON_STATE_LABELS,
  RAZORPAY_BUTTONS,
  paymentButtonViewSchema,
  type PaymentButtonService,
  type PaymentButtonView,
} from '@docversity/validation';
import { studentRequest } from '@/lib/api';

/** Each mount owns its form/script. React owns only the container, not provider-mutated children. */
export function RazorpayTestEmbed({
  checkout,
  label,
}: {
  checkout: NonNullable<PaymentButtonView['checkout']>;
  label: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const host = root.current;
    // Mentor button IDs have unknown merchant/mode; never load them in a synthetic environment.
    if (
      !host ||
      !/^pl_[A-Za-z0-9]{1,50}$/.test(checkout.buttonId) ||
      Object.values(RAZORPAY_BUTTONS).some((button) => button.id === checkout.buttonId)
    )
      return;
    const form = document.createElement('form');
    form.setAttribute('aria-label', label);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
    });
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/payment-button.js';
    script.async = true;
    script.dataset.payment_button_id = checkout.buttonId;
    script.onerror = () => {
      setFailed(true);
    };
    form.append(script);
    host.append(form);
    return () => {
      script.onerror = null;
      form.remove();
    };
  }, [checkout.buttonId, checkout.mode, label]);
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Test checkout only. Opening or returning from checkout does not confirm payment.
      </p>
      <div ref={root} />
      {failed && (
        <p role="alert" className="text-sm text-danger-text">
          Checkout could not load. Your payment has not been confirmed. Refresh to try again.
        </p>
      )}
    </div>
  );
}

export function PaymentButtonPanel({
  service,
  path,
}: {
  service: PaymentButtonService;
  path: string;
}) {
  const id = useId();
  const [result, setResult] = useState<{ path: string; view: PaymentButtonView } | null>(null);
  useEffect(() => {
    let active = true;
    void studentRequest('GET', `student/payment-buttons/${path}`, paymentButtonViewSchema)
      .then((view) => {
        if (active && view.service === service) setResult({ path, view });
      })
      .catch(() => {
        /* Fail closed: never substitute a client-side payable state. */
      });
    return () => {
      active = false;
    };
  }, [path, service]);
  const view = result?.path === path && result.view.service === service ? result.view : null;
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-card p-4">
      <h3 id={id} className="text-sm font-semibold text-navy-950">
        {RAZORPAY_BUTTONS[service].label}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Payment status: {view ? PAYMENT_BUTTON_STATE_LABELS[view.status] : 'Unavailable'}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {view?.unavailableReason ??
          (view?.checkout
            ? 'Use test details only. Staff must verify the provider record and application ownership.'
            : 'Online payment is currently unavailable. No transaction can be started here.')}
      </p>
      {view?.checkout && view.status === 'PENDING' && (
        <RazorpayTestEmbed checkout={view.checkout} label={RAZORPAY_BUTTONS[service].label} />
      )}
    </section>
  );
}
