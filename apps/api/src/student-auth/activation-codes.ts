import { createHmac, randomBytes } from 'node:crypto';
import {
  ACTIVATION_CODE_ALPHABET,
  ACTIVATION_CODE_LENGTH,
  formatActivationCode,
} from '@docversity/validation';

/**
 * A new activation code: 12 symbols drawn uniformly from the 32-symbol alphabet (256 is a multiple of
 * 32, so `byte % 32` has no modulo bias) — 60 bits from the CSPRNG.
 */
export function generateActivationCode(): { code: string; formatted: string } {
  const bytes = randomBytes(ACTIVATION_CODE_LENGTH);
  let code = '';
  for (const byte of bytes)
    code += ACTIVATION_CODE_ALPHABET.charAt(byte % ACTIVATION_CODE_ALPHABET.length);
  return { code, formatted: formatActivationCode(code) };
}

/** Keyed hash stored instead of the code (SESSION_SECRET); a database dump cannot reveal codes. */
export function hashActivationCode(secret: string, normalizedCode: string): string {
  return createHmac('sha256', secret).update(`student-activation:${normalizedCode}`).digest('hex');
}
