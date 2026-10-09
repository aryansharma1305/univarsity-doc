import { describe, expect, it } from 'vitest';
import {
  MemoryObjectStorage,
  ObjectNotFoundError,
  ObjectTooLargeError,
  objectKeys,
} from '../src/index.js';

const JOB = '0199a8f0-0000-7000-8000-000000000001';

describe('objectKeys', () => {
  it('builds keys only from generated identifiers', () => {
    const key = objectKeys.importSource(JOB);
    expect(key).toMatch(
      /^imports\/0199a8f0-0000-7000-8000-000000000001\/source-[0-9a-f-]{36}\.xlsx$/,
    );
    expect(objectKeys.importSource(JOB)).not.toBe(key);
    expect(objectKeys.importErrorReport(JOB)).toMatch(/\/error-report-[0-9a-f-]{36}\.xlsx$/);
  });

  it('refuses anything that is not a UUID (no path traversal through ids)', () => {
    expect(() => objectKeys.importSource('../../etc/passwd')).toThrow();
    expect(() => objectKeys.importErrorReport('a/b')).toThrow();
    expect(() => objectKeys.paymentDestinationQr('../x', 'png')).toThrow();
    expect(() => objectKeys.reExamPaymentEvidence('a/b', 'pdf')).toThrow();
  });

  it('keeps payment QR images and evidence under separate generated prefixes', () => {
    expect(objectKeys.paymentDestinationQr(JOB, 'png')).toMatch(
      /^payments\/destinations\/0199a8f0-0000-7000-8000-000000000001\/qr-[0-9a-f-]{36}\.png$/,
    );
    expect(objectKeys.reExamPaymentEvidence(JOB, 'pdf')).toMatch(
      /^payments\/evidence\/0199a8f0-0000-7000-8000-000000000001\/[0-9a-f-]{36}\.pdf$/,
    );
  });
});

describe('MemoryObjectStorage', () => {
  it('stores, reads with a size limit and deletes objects', async () => {
    const storage = new MemoryObjectStorage();
    await storage.putObject('k', new Uint8Array([1, 2, 3]), {
      contentType: 'application/octet-stream',
    });
    expect(Array.from(await storage.getObject('k', { maxBytes: 3 }))).toEqual([1, 2, 3]);
    await expect(storage.getObject('k', { maxBytes: 2 })).rejects.toBeInstanceOf(
      ObjectTooLargeError,
    );
    await storage.deleteObject('k');
    await expect(storage.getObject('k', { maxBytes: 3 })).rejects.toBeInstanceOf(
      ObjectNotFoundError,
    );
  });
});
