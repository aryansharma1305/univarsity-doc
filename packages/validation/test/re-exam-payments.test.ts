import { describe, expect, it } from 'vitest';
import {
  createPaymentDestinationSchema,
  normalizeTransactionReference,
  PAYMENT_REGION_LABELS,
  PAYMENT_REGIONS,
  isRegionGroup,
  startReExamPaymentSchema,
  submitReExamPaymentSchema,
  verifyReExamPaymentSchema,
} from '../src/index.js';

const base = {
  region: 'INDIA',
  beneficiaryName: 'Synthetic Fees Account',
  method: 'UPI',
  currency: 'INR',
  instructions: 'TEST ONLY: scan the synthetic QR and keep the confirmation.',
  evidenceRequirement: 'OPTIONAL',
  effectiveFrom: '2026-10-01T00:00:00Z',
};

describe('payment regions', () => {
  it('lists exactly the eight requested choices, three of them region groups', () => {
    expect(PAYMENT_REGIONS.map((r) => PAYMENT_REGION_LABELS[r])).toEqual([
      'India',
      'Nepal',
      'Bangladesh',
      'Pakistan',
      'Afghanistan',
      'Europe',
      'Central Asia',
      'Others',
    ]);
    expect(PAYMENT_REGIONS.filter(isRegionGroup)).toEqual(['EUROPE', 'CENTRAL_ASIA', 'OTHERS']);
    expect(startReExamPaymentSchema.safeParse({ region: 'BHUTAN' }).success).toBe(false);
  });
});

describe('transaction references', () => {
  it('normalises for duplicate detection', () => {
    expect(normalizeTransactionReference(' utr-1234 5678/90 ')).toBe('UTR1234567890');
    expect(normalizeTransactionReference('ＵＴＲ１２３４５６')).toBe('UTR123456');
  });

  it('accepts real-looking references and refuses PINs, OTPs and junk', () => {
    for (const ok of ['UTR1234567890', '412345678901', 'TXN-2026/10-0042', 'ab12 cd34 ef']) {
      expect(submitReExamPaymentSchema.safeParse({ transactionReference: ok }).success, ok).toBe(
        true,
      );
    }
    for (const bad of [
      '1234',
      '123456',
      'my OTP 44556677',
      'PIN 99887766',
      'cvv 123456',
      'abc',
      '<script>',
      '-12345678',
      'x'.repeat(65),
    ]) {
      expect(submitReExamPaymentSchema.safeParse({ transactionReference: bad }).success, bad).toBe(
        false,
      );
    }
    expect(
      submitReExamPaymentSchema.safeParse({ transactionReference: 'UTR1234567890', amount: '1' })
        .success,
    ).toBe(false);
  });
});

describe('destinations and verification', () => {
  it('validates countries, validity and exact per-attempt amounts', () => {
    expect(createPaymentDestinationSchema.safeParse(base).success).toBe(true);
    expect(
      createPaymentDestinationSchema.safeParse({ ...base, countryName: 'India' }).success,
    ).toBe(false);
    expect(
      createPaymentDestinationSchema.safeParse({
        ...base,
        region: 'EUROPE',
        currency: 'EUR',
        countryName: 'Synthetic SEPA area',
        rates: [{ attemptNumber: 1, amount: '12.50' }],
      }).success,
    ).toBe(true);
    for (const rates of [
      [{ attemptNumber: 2, amount: '10' }],
      [{ attemptNumber: 1, amount: '10.005' }],
      [{ attemptNumber: 1, amount: '-1' }],
    ]) {
      expect(
        createPaymentDestinationSchema.safeParse({ ...base, currency: 'NPR', rates }).success,
      ).toBe(false);
    }
    expect(
      createPaymentDestinationSchema.safeParse({
        ...base,
        effectiveUntil: '2026-09-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('requires the account-check confirmation and an exact amount to verify', () => {
    const ok = {
      verifiedAmount: '1000.00',
      verifiedCurrency: 'inr',
      confirmedAgainstUniversityAccount: true,
    };
    expect(verifyReExamPaymentSchema.parse(ok).verifiedCurrency).toBe('INR');
    expect(
      verifyReExamPaymentSchema.safeParse({ ...ok, confirmedAgainstUniversityAccount: false })
        .success,
    ).toBe(false);
    expect(verifyReExamPaymentSchema.safeParse({ ...ok, verifiedAmount: '10.001' }).success).toBe(
      false,
    );
  });
});
