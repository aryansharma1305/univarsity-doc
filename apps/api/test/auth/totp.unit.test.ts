import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totp,
  totpStep,
  verifyTotp,
} from '../../src/auth/totp.js';
import { generateRecoveryCodes, MfaCrypto } from '../../src/auth/mfa-crypto.js';

// RFC 4226 Appendix D: secret "12345678901234567890", counters 0..9.
const RFC4226_KEY = Buffer.from('12345678901234567890');
const RFC4226_CODES = [
  '755224',
  '287082',
  '359152',
  '969429',
  '338314',
  '254676',
  '287922',
  '162583',
  '399871',
  '520489',
];

// RFC 6238 Appendix B (8 digits, 30 s steps). Seeds are the ASCII "1234567890" repeated to the
// hash's block-size key length.
const SEED = {
  sha1: Buffer.from('12345678901234567890'),
  sha256: Buffer.from('12345678901234567890123456789012'),
  sha512: Buffer.from('1234567890123456789012345678901234567890123456789012345678901234'),
} as const;
const RFC6238: [number, string, string, string][] = [
  // [time (s), SHA1, SHA256, SHA512]
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

describe('HOTP (RFC 4226 test vectors)', () => {
  it.each(RFC4226_CODES.map((code, counter) => [counter, code] as const))(
    'counter %i → %s',
    (counter, code) => {
      expect(hotp(RFC4226_KEY, counter)).toBe(code);
    },
  );
  it('rejects negative or unsafe counters', () => {
    expect(() => hotp(RFC4226_KEY, -1)).toThrow();
    expect(() => hotp(RFC4226_KEY, 2 ** 60)).toThrow();
  });
});

describe('TOTP (RFC 6238 Appendix B test vectors)', () => {
  it.each(RFC6238)('T=%i', (seconds, sha1, sha256, sha512) => {
    const now = seconds * 1000;
    expect(totp(SEED.sha1, now, { digits: 8, algorithm: 'sha1' })).toBe(sha1);
    expect(totp(SEED.sha256, now, { digits: 8, algorithm: 'sha256' })).toBe(sha256);
    expect(totp(SEED.sha512, now, { digits: 8, algorithm: 'sha512' })).toBe(sha512);
  });
  it('uses 30-second steps', () => {
    expect(totpStep(59_000)).toBe(1);
    expect(totpStep(60_000)).toBe(2);
    expect(totpStep(1_111_111_109_000)).toBe(0x23523ec);
  });
});

describe('verifyTotp: ±1 step window and replay protection', () => {
  const key = generateTotpSecret();
  const now = 1_800_000_015_000; // mid-step
  const step = totpStep(now);
  const codeAt = (s: number) => hotp(key, s);

  it('accepts the previous, current and next step and returns the matched step', () => {
    expect(verifyTotp(key, codeAt(step), now, null)).toBe(step);
    expect(verifyTotp(key, codeAt(step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(key, codeAt(step + 1), now, null)).toBe(step + 1);
  });
  it('rejects codes two or more steps away', () => {
    expect(verifyTotp(key, codeAt(step - 2), now, null)).toBeNull();
    expect(verifyTotp(key, codeAt(step + 2), now, null)).toBeNull();
  });
  it('never accepts a step at or below the last used step (replay)', () => {
    expect(verifyTotp(key, codeAt(step), now, step)).toBeNull();
    expect(verifyTotp(key, codeAt(step - 1), now, step)).toBeNull();
    expect(verifyTotp(key, codeAt(step + 1), now, step)).toBe(step + 1);
  });
  it('rejects malformed codes', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', ' 12345', '12345\n']) {
      expect(verifyTotp(key, bad, now, null)).toBeNull();
    }
  });
});

describe('base32 (RFC 4648 §10 vectors, unpadded)', () => {
  it.each([
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ])('%j ↔ %s', (plain, encoded) => {
    expect(base32Encode(Buffer.from(plain))).toBe(encoded);
    expect(base32Decode(encoded).toString()).toBe(plain);
  });
  it('round-trips a generated 160-bit secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(20);
    expect(base32Encode(secret)).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true);
  });
  it('rejects non-base32 input', () => {
    expect(() => base32Decode('MZXW1')).toThrow();
  });
});

describe('otpauth URI', () => {
  it('carries issuer, account and the standard parameters', () => {
    const raw = otpauthUri({
      issuer: 'Docversity',
      account: 'a.b@example.test',
      secret: 'MZXW6YTBOI',
    });
    expect(raw.startsWith('otpauth://totp/Docversity:a.b%40example.test?')).toBe(true);
    const uri = new URL(raw);
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret: 'MZXW6YTBOI',
      issuer: 'Docversity',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
  });
});

describe('MfaCrypto', () => {
  const crypto = new MfaCrypto('ab'.repeat(32));
  const userId = '0190f0f0-0000-7000-8000-000000000001';

  it('encrypts with AES-256-GCM: random IV, round-trips, never contains the plaintext', () => {
    const secret = generateTotpSecret();
    const a = crypto.encrypt(secret, userId, 'secret');
    const b = crypto.encrypt(secret, userId, 'secret');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(a).not.toContain(base32Encode(secret));
    expect(crypto.decrypt(a, userId, 'secret').equals(secret)).toBe(true);
  });
  it('binds the ciphertext to the user and purpose, and detects tampering or another key', () => {
    const value = crypto.encrypt(generateTotpSecret(), userId, 'secret');
    expect(() => crypto.decrypt(value, '0190f0f0-0000-7000-8000-000000000002', 'secret')).toThrow();
    expect(() => crypto.decrypt(value, userId, 'enrollment')).toThrow();
    const [v, iv, ct, tag] = value.split('.');
    const flipped = `${v}.${iv}.${ct?.startsWith('A') ? 'B' : 'A'}${ct?.slice(1)}.${tag}`;
    expect(() => crypto.decrypt(flipped, userId, 'secret')).toThrow();
    expect(() => new MfaCrypto('cd'.repeat(32)).decrypt(value, userId, 'secret')).toThrow();
  });
  it('refuses keys that are not 32 bytes', () => {
    expect(() => new MfaCrypto('ab'.repeat(16))).toThrow();
  });
  it('hashes recovery codes per user (keyed, deterministic, lower-case hex)', () => {
    const hash = crypto.hashRecoveryCode(userId, 'ABCDEFGHIJ');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(crypto.hashRecoveryCode(userId, 'ABCDEFGHIJ')).toBe(hash);
    expect(crypto.hashRecoveryCode('other', 'ABCDEFGHIJ')).not.toBe(hash);
    expect(new MfaCrypto('cd'.repeat(32)).hashRecoveryCode(userId, 'ABCDEFGHIJ')).not.toBe(hash);
  });
  it('generates ten distinct 50-bit recovery codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes.map((code) => code.normalised)).size).toBe(10);
    for (const code of codes) {
      expect(code.normalised).toMatch(/^[A-Z2-7]{10}$/);
      expect(code.display).toBe(`${code.normalised.slice(0, 5)}-${code.normalised.slice(5)}`);
    }
  });
});
