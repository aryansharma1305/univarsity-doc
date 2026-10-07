import { describe, expect, it } from 'vitest';
import { loginRequestSchema, newPasswordSchema, passwordPolicyViolations } from '../src/index.js';

describe('password policy', () => {
  it('accepts long passphrases without composition rules', () => {
    expect(passwordPolicyViolations('correct horse battery staple')).toEqual([]);
    expect(passwordPolicyViolations('all lowercase words here')).toEqual([]);
    expect(newPasswordSchema.safeParse('पासवर्ड वाक्यांश लंबा है').success).toBe(true);
  });

  it('requires at least 12 characters and at most 128', () => {
    expect(passwordPolicyViolations('short pass')).toContain('must be at least 12 characters');
    expect(passwordPolicyViolations('x'.repeat(129)).join()).toMatch(/at most 128/);
  });

  it('rejects common passwords, repeats and simple sequences', () => {
    expect(passwordPolicyViolations('Password1234')).toContain('is too common');
    expect(passwordPolicyViolations('aaaaaaaaaaaaaa')).toContain(
      'must not repeat a single character',
    );
    expect(passwordPolicyViolations('1234567890123')).toContain('is too common');
    expect(passwordPolicyViolations('abcdefghijklmn')).toContain('must not be a simple sequence');
    expect(passwordPolicyViolations('987654321098')).toContain('must not be a simple sequence');
  });

  it('rejects passwords containing the email local-part or display name', () => {
    expect(
      passwordPolicyViolations('registrar.office-2026', { email: 'registrar.office@uni.test' }),
    ).toContain('must not contain your email address');
    expect(
      passwordPolicyViolations('i am priya sharma ok', { displayName: 'Priya Sharma' }),
    ).toContain('must not contain your name');
  });
});

describe('login request', () => {
  it('normalises email case and whitespace', () => {
    expect(loginRequestSchema.parse({ email: '  Admin@Example.TEST ', password: 'x' }).email).toBe(
      'admin@example.test',
    );
  });

  it('does not echo the password in validation messages', () => {
    const result = loginRequestSchema.safeParse({
      email: 'not-an-email',
      password: 'Sup3r-Secret-Value',
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).not.toContain('Sup3r-Secret-Value');
  });
});
