import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';

/** 32 bytes of CSPRNG output, base64url (43 characters, 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time string comparison (false for different lengths without leaking timing of content). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Keyed hashing of identifiers (emails, IPs, tokens) with SESSION_SECRET, so Redis keys, logs and
 * audit metadata never contain the raw values yet stay correlatable.
 */
@Injectable()
export class IdentifierHasher {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  hash(purpose: string, value: string): string {
    return createHmac('sha256', this.config.SESSION_SECRET)
      .update(`${purpose}\u0000${value}`)
      .digest('hex');
  }
}
