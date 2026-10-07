import { describe, expect, it } from 'vitest';
import { PasswordService } from '../../src/auth/password.service.js';

const service = new PasswordService();

describe('PasswordService (Argon2id)', () => {
  it('hashes with Argon2id m=19456 KiB, t=2, p=1 and a random salt', async () => {
    const a = await service.hashPassword('correct horse battery staple');
    const b = await service.hashPassword('correct horse battery staple');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('correct horse');
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await service.hashPassword('correct horse battery staple');
    await expect(service.verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(service.verifyPassword(hash, 'correct horse battery stapler')).resolves.toBe(
      false,
    );
  });

  it('returns false (never throws) for malformed hashes', async () => {
    await expect(service.verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('spends real hashing work for unknown accounts and always fails', async () => {
    await expect(service.verifyAgainstDummy('whatever')).resolves.toBe(false);
  });
});
