import { describe, expect, it } from 'vitest';
import {
  createReExamFeeRuleSchema,
  currencyMinorDigits,
  formatMoney,
  isKnownCurrency,
  isSafeHttpsUrl,
  reExamReference,
  toMinorUnits,
} from '../src/index.js';

describe('exact money handling', () => {
  it('converts major-unit text to integer minor units without floating point', () => {
    expect(toMinorUnits('1000', 'INR')).toBe(100_000);
    expect(toMinorUnits('2500.00', 'INR')).toBe(250_000);
    expect(toMinorUnits('0.10', 'INR')).toBe(10);
    // 0.1 + 0.2 style traps never apply: digits are concatenated, not multiplied.
    expect(toMinorUnits('19.99', 'EUR')).toBe(1999);
    expect(toMinorUnits('1000', 'JPY')).toBe(1000);
    for (const bad of ['0', '-1', '1,000', '1e3', '10.001', 'abc', '', '1.2.3']) {
      expect(toMinorUnits(bad, 'INR'), bad).toBeNull();
    }
    expect(toMinorUnits('5.5', 'JPY')).toBeNull(); // no minor unit
  });

  it('knows currency codes and their minor digits', () => {
    expect(isKnownCurrency('INR')).toBe(true);
    expect(isKnownCurrency('NPR')).toBe(true);
    expect(isKnownCurrency('XYZ')).toBe(false);
    expect(isKnownCurrency('inr')).toBe(false);
    expect(currencyMinorDigits('INR')).toBe(2);
    expect(formatMoney(100_000, 'INR')).toBe('₹1,000.00');
  });
});

describe('fee rule contract', () => {
  const rule = (rates: { attemptNumber: number; amount: string }[], currency = 'INR') =>
    createReExamFeeRuleSchema.safeParse({ scope: 'PER_SUBJECT', currency, rates });

  it('accepts the confirmed schedule and refuses gaps, bad amounts and unknown currencies', () => {
    expect(
      rule([
        { attemptNumber: 1, amount: '1000' },
        { attemptNumber: 2, amount: '2500' },
      ]).success,
    ).toBe(true);
    expect(rule([{ attemptNumber: 2, amount: '2500' }]).success).toBe(false);
    expect(rule([{ attemptNumber: 1, amount: '10.005' }]).success).toBe(false);
    expect(rule([{ attemptNumber: 1, amount: '1000' }], 'ABC').success).toBe(false);
    expect(rule([]).success).toBe(false);
    expect(
      createReExamFeeRuleSchema.safeParse({
        currency: 'INR',
        rates: [{ attemptNumber: 1, amount: '1000' }],
      }).success,
    ).toBe(false); // scope must be chosen explicitly
  });
});

describe('identifiers and links', () => {
  it('builds short references and accepts only safe https links', () => {
    expect(reExamReference('01a12015-8e91-7566-a322-77257f822a6c')).toBe('RX-7F82-2A6C');
    expect(isSafeHttpsUrl('https://exams.example.test/a?b=1')).toBe(true);
    for (const bad of [
      'http://exams.example.test',
      'https://u:p@exams.example.test',
      'javascript:alert(1)',
      'https://exams.example.test/a b',
    ]) {
      expect(isSafeHttpsUrl(bad), bad).toBe(false);
    }
  });
});
