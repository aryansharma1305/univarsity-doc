import { type Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters — the OWASP Password Storage Cheat Sheet's first recommended configuration:
 * m = 19 MiB, t = 2 iterations, p = 1. Roughly tens of milliseconds per hash on server hardware,
 * which keeps login responsive while making offline cracking expensive.
 */
export const ARGON2_PARAMETERS = {
  // `Algorithm` is an ambient const enum, which isolatedModules cannot reference as a value.
  // 2 === Algorithm.Argon2id; the tests assert every hash starts with `$argon2id$`.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment
  algorithm: 2 as Algorithm,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Password hashing abstraction. Plain class (no framework dependency) so the admin CLI can use it.
 */
export class PasswordService {
  /** A real Argon2id hash of a random value, used to equalise timing for unknown accounts. */
  private dummyHash: Promise<string> | undefined;

  hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2_PARAMETERS);
  }

  /** Never throws for malformed hashes; returns false instead. */
  async verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Spends the same work as a real verification and always returns false. Used when the account
   * does not exist (or has no password) so response timing does not reveal which emails exist.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hashPassword(`dummy-${crypto.randomUUID()}`);
    await this.verifyPassword(await this.dummyHash, password);
    return false;
  }
}
