import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Minimal, dependency-free HOTP (RFC 4226) / TOTP (RFC 6238) — tested against the RFC test vectors
 * (test/auth/totp.unit.test.ts). Staff authenticators use the interoperable defaults every
 * authenticator app supports: HMAC-SHA1, 6 digits, 30-second steps, a 160-bit random secret.
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous, current and next step (clock drift of up to ±30 s). */
export const TOTP_WINDOW = 1;
export const TOTP_SECRET_BYTES = 20;

export type HotpAlgorithm = 'sha1' | 'sha256' | 'sha512';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding (the format authenticator apps expect). */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET.charAt((value << (5 - bits)) & 31);
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 input');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

/** RFC 4226 HOTP with dynamic truncation. */
export function hotp(
  key: Uint8Array,
  counter: number,
  options: { digits?: number; algorithm?: HotpAlgorithm } = {},
): string {
  const digits = options.digits ?? TOTP_DIGITS;
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('Invalid HOTP counter');
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(options.algorithm ?? 'sha1', key)
    .update(message)
    .digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The RFC 6238 time step for a Unix time in milliseconds. */
export function totpStep(nowMs: number, period = TOTP_PERIOD_SECONDS): number {
  return Math.floor(nowMs / 1000 / period);
}

export function totp(
  key: Uint8Array,
  nowMs: number,
  options: { digits?: number; algorithm?: HotpAlgorithm; period?: number } = {},
): string {
  return hotp(key, totpStep(nowMs, options.period), options);
}

/**
 * Verifies a 6-digit code within ±TOTP_WINDOW steps. Steps at or below `lastUsedStep` are never
 * accepted (replay protection: each step — and therefore each code — works at most once, and an
 * older code cannot be used after a newer one). Returns the matched step, or null. Every candidate
 * is compared in constant time and all candidates are always computed.
 */
export function verifyTotp(
  key: Uint8Array,
  code: string,
  nowMs: number,
  lastUsedStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(nowMs);
  let matched: number | null = null;
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
    const step = current + offset;
    if (step < 0) continue;
    const equal = timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(code));
    if (equal && (lastUsedStep === null || step > lastUsedStep) && matched === null) matched = step;
  }
  return matched;
}

export function generateTotpSecret(): Buffer {
  return randomBytes(TOTP_SECRET_BYTES);
}

/** otpauth:// URI (Key Uri Format) for QR enrollment. */
export function otpauthUri(input: { issuer: string; account: string; secret: string }): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.account)}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
