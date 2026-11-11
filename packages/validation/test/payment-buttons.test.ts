import { describe, expect, it } from 'vitest';
import {
  RAZORPAY_BUTTONS,
  paymentButtonViewSchema,
  reconcileRazorpayPaymentSchema,
} from '../src/payment-buttons.js';
const id = '01900000-0000-7000-8000-000000000001';
const view = {
  service: 'RE_EXAM',
  applicationId: id,
  paymentId: null,
  status: 'UNAVAILABLE',
  unavailableReason: 'Disabled',
  certificateFeeScope: 'HARD_COPY_ONLY',
  checkout: null,
  liveTransactionsEnabled: false,
  qrFallbackEnabled: false,
};
describe('payment button contracts', () => {
  it('preserves the exact mentor button mappings and hard-copy-only label', () => {
    expect(Object.values(RAZORPAY_BUTTONS).map((button) => button.id)).toEqual([
      'pl_TyWPTClJKY5RFa',
      'pl_TyWTRF7DImX3Pu',
      'pl_TyWXU0D8UbPlEC',
    ]);
    expect(RAZORPAY_BUTTONS.CERTIFICATE_HARD_COPY.label).toBe('Pay for Hard Copy Certificate');
  });
  it('has no live activation or QR fallback in the response contract', () => {
    expect(paymentButtonViewSchema.safeParse(view).success).toBe(true);
    for (const key of ['liveTransactionsEnabled', 'qrFallbackEnabled'])
      expect(paymentButtonViewSchema.safeParse({ ...view, [key]: true }).success).toBe(false);
  });
  it.each(Object.values(RAZORPAY_BUTTONS).map((button) => button.id))(
    'never loads an unverified mentor button in synthetic checkout: %s',
    (buttonId) => {
      expect(
        paymentButtonViewSchema.safeParse({ ...view, checkout: { mode: 'TEST', buttonId } })
          .success,
      ).toBe(false);
    },
  );
  it('requires explicit staff reconciliation attestations and correct service', () => {
    const body = {
      receiptId: id,
      paymentId: id,
      buttonId: RAZORPAY_BUTTONS.RE_EXAM.id,
      confirmedStudentOwnership: true,
      confirmedAgainstProviderRecords: true,
      reportReference: 'SYNTHETIC-REPORT',
    };
    expect(reconcileRazorpayPaymentSchema.safeParse(body).success).toBe(true);
    for (const change of [
      { buttonId: RAZORPAY_BUTTONS.EXAM.id },
      { confirmedStudentOwnership: false },
      { confirmedAgainstProviderRecords: false },
      { status: 'PAID' },
    ])
      expect(reconcileRazorpayPaymentSchema.safeParse({ ...body, ...change }).success).toBe(false);
  });
});
