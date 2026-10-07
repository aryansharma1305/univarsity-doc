import { describe, expect, it } from 'vitest';
import { TimeoutError, withTimeout } from '../src/common/with-timeout.js';

describe('withTimeout', () => {
  it('resolves with the operation result when it finishes in time', async () => {
    await expect(withTimeout(() => Promise.resolve(42), 100)).resolves.toBe(42);
  });

  it('rejects with TimeoutError and aborts the signal when the deadline passes', async () => {
    let aborted = false;
    const operation = (signal: AbortSignal) =>
      new Promise<never>(() => {
        signal.addEventListener('abort', () => {
          aborted = true;
        });
      });
    await expect(withTimeout(operation, 20)).rejects.toBeInstanceOf(TimeoutError);
    expect(aborted).toBe(true);
  });

  it('propagates operation errors unchanged', async () => {
    await expect(withTimeout(() => Promise.reject(new Error('boom')), 100)).rejects.toThrow('boom');
  });
});
