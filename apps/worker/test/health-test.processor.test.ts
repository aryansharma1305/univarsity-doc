import { describe, expect, it } from 'vitest';
import { processHealthTestJob } from '../src/jobs/health-test.processor.ts';

describe('processHealthTestJob', () => {
  it('returns a deterministic result derived only from the input', () => {
    const input = { message: 'Docversity worker health check' };
    const expected = {
      ok: true,
      echo: 'Docversity worker health check',
      length: 30,
      processedBy: 'docversity-worker',
    };
    expect(processHealthTestJob(input)).toEqual(expected);
    expect(processHealthTestJob(input)).toEqual(expected);
  });

  it('rejects invalid payloads', () => {
    expect(() => processHealthTestJob({ message: '' })).toThrow();
    expect(() => processHealthTestJob({})).toThrow();
  });
});
