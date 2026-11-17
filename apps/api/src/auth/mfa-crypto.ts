import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Unambiguous RFC 4648 base32 alphabet for recovery codes (no 0/1/8/9 to confuse with O/I/B/g). */
const RECOVERY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const RECOVERY_CODE_COUNT = 10;
/** 10 base32 characters = 50 bits per code; only an HMAC is stored and each works once. */
const RECOVERY_CODE_LENGTH = 10;

/**
 * Encryption at rest for staff TOTP secrets and keyed hashing of recovery codes, both derived from
 * STAFF_MFA_ENCRYPTION_KEY with HKDF (separate sub-keys per purpose). Plain class without framework
 * dependencies so the operator CLI can share it.
 *
 * Ciphertext format: `v1.<iv>.<ciphertext>.<tag>` (base64url), AES-256-GCM with the user ID (and the
 * purpose) as associated data, so a ciphertext copied onto another user's row does not decrypt.
 */
export class MfaCrypto {
  private readonly encryptionKey: Buffer;
  private readonly recoveryKey: Buffer;

  constructor(masterKeyHex: string) {
    const master = Buffer.from(masterKeyHex, 'hex');
    if (master.length !== 32) throw new Error('STAFF_MFA_ENCRYPTION_KEY must be 32 bytes');
    this.encryptionKey = Buffer.from(
      hkdfSync('sha256', master, Buffer.alloc(0), 'docversity staff-mfa totp-secret v1', 32),
    );
    this.recoveryKey = Buffer.from(
      hkdfSync('sha256', master, Buffer.alloc(0), 'docversity staff-mfa recovery-code v1', 32),
    );
  }

  encrypt(plaintext: Buffer, userId: string, purpose: 'secret' | 'enrollment'): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv, {
      authTagLength: TAG_BYTES,
    });
    cipher.setAAD(aad(userId, purpose));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return [VERSION, iv, ciphertext, cipher.getAuthTag()]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  /** Throws if the value was tampered with, belongs to another user, or another key was used. */
  decrypt(value: string, userId: string, purpose: 'secret' | 'enrollment'): Buffer {
    const [version, iv, ciphertext, tag, ...rest] = value.split('.');
    if (version !== VERSION || !iv || !ciphertext || !tag || rest.length > 0) {
      throw new Error('Unsupported MFA secret format');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(iv, 'base64url'),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(aad(userId, purpose));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]);
  }

  /** Lower-case hex HMAC-SHA256 of a normalised recovery code, bound to its user. */
  hashRecoveryCode(userId: string, normalisedCode: string): string {
    return createHmac('sha256', this.recoveryKey)
      .update(`${userId}\u0000${normalisedCode}`)
      .digest('hex');
  }
}

function aad(userId: string, purpose: string): Buffer {
  return Buffer.from(`docversity:staff-mfa:${purpose}:${userId}`);
}

/** Fresh recovery codes: `{ display: 'ABCDE-FGHIJ', normalised: 'ABCDEFGHIJ' }`. */
export function generateRecoveryCodes(
  count = RECOVERY_CODE_COUNT,
): { display: string; normalised: string }[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const bytes = randomBytes(RECOVERY_CODE_LENGTH);
    // 256 is a multiple of 32: masking the low 5 bits is unbiased.
    codes.add(Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte & 31]).join(''));
  }
  return [...codes].map((normalised) => ({
    normalised,
    display: `${normalised.slice(0, 5)}-${normalised.slice(5)}`,
  }));
}
