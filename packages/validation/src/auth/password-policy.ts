import { z } from 'zod';

/**
 * Staff password policy (NIST SP 800-63B style):
 * - at least 12 characters, at most 128 (the upper bound protects the hashing cost);
 * - no composition rules (no forced symbols/digits/upper-case);
 * - rejects commonly used passwords, single-character repeats and simple sequences;
 * - rejects passwords that contain the account's email local-part or display name.
 *
 * Length is measured in Unicode code points so passphrases in any script count fairly.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * A small deny-list of the most common passwords that satisfy the length rule. Not exhaustive —
 * a breached-password check (e.g. k-anonymity range queries) can be added later if approved.
 */
const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890123',
  '12345678901234',
  '123456789012345',
  '1234567890qwerty',
  'qwertyuiop12',
  'qwertyuiop123',
  'qwertyuiopasdf',
  'qwertyuiopasdfgh',
  'qwerty123456',
  'qwerty1234567',
  'password1234',
  'password12345',
  'password123456',
  'password@1234',
  'passwordpassword',
  'p@ssw0rd1234',
  'p@ssword1234',
  'iloveyou1234',
  'administrator',
  'administrator1',
  'admin1234567',
  'admin@123456',
  'adminadmin12',
  'welcome12345',
  'welcome@1234',
  'letmein12345',
  'changeme1234',
  'changeme12345',
  'trustno1trustno1',
  'football1234',
  'baseball1234',
  'sunshine1234',
  'princess1234',
  'monkey123456',
  'dragon123456',
  'abc123456789',
  'abcdefghijkl',
  'abcd12345678',
  'asdfghjkl123',
  'zxcvbnm12345',
  '1q2w3e4r5t6y',
  '1qaz2wsx3edc',
  'qazwsxedcrfv',
  'university123',
  'university@123',
  'docversity123',
  'docversity@123',
  'registrar1234',
]);

const SEQUENCES = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm'];

function isSimpleSequence(value: string): boolean {
  const lower = value.toLowerCase();
  return SEQUENCES.some((sequence) => {
    const doubled = sequence + sequence;
    const reversed = Array.from(doubled).reverse().join('');
    return doubled.includes(lower) || reversed.includes(lower);
  });
}

export interface PasswordContext {
  email?: string;
  displayName?: string;
}

/** Returns human-readable policy violations; an empty array means the password is acceptable. */
export function passwordPolicyViolations(
  password: string,
  context: PasswordContext = {},
): string[] {
  const problems: string[] = [];
  const length = Array.from(password).length; // code points, not UTF-16 units
  if (length < PASSWORD_MIN_LENGTH) {
    problems.push(`must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (length > PASSWORD_MAX_LENGTH) {
    problems.push(`must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  const lower = password.toLowerCase();
  const compact = lower.replace(/\s+/g, '');
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(compact)) {
    problems.push('is too common');
  } else if (/^(.)\1+$/u.test(password)) {
    problems.push('must not repeat a single character');
  } else if (isSimpleSequence(compact)) {
    problems.push('must not be a simple sequence');
  }
  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    problems.push('must not contain your email address');
  }
  const name = context.displayName?.trim().toLowerCase();
  if (name && name.length >= 4 && lower.includes(name)) {
    problems.push('must not contain your name');
  }
  return problems;
}

/** A new password (without account context — use passwordPolicyViolations for the full check). */
export const newPasswordSchema = z.string().superRefine((value, ctx) => {
  for (const problem of passwordPolicyViolations(value)) {
    ctx.addIssue({ code: 'custom', message: `Password ${problem}.` });
  }
});
