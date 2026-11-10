import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { legacyDryRun } from '../src/legacy-dry-run.js';
import type { LegacyDryRun } from '@docversity/validation';
const row = (id: string, key = id) => ({
  sourceId: id,
  entity: 'SUBJECT' as const,
  naturalKey: key,
  references: [] as string[],
  values: { name: 'Synthetic subject' },
});
const input = (records: LegacyDryRun['records']): LegacyDryRun => ({
  id: randomUUID(),
  usage: 'SYNTHETIC_ONLY',
  sourceSystem: 'SYNTHETIC_ARCHIVE',
  records,
});
describe('generic synthetic migration dry run', () => {
  it('deduplicates identical rows and reconciles every source row without granting import', () => {
    const r = legacyDryRun(input([row('SYN-A'), row('SYN-A')]));
    expect(r.counts).toEqual({ source: 2, accepted: 1, duplicates: 1, quarantined: 0 });
    expect(r.importAllowed).toBe(false);
  });
  it('quarantines both sides of conflicting duplicates and their dependencies', () => {
    const a = row('SYN-A');
    const b = { ...row('SYN-B'), references: ['SYN-A'] };
    const r = legacyDryRun(input([a, { ...a, values: { name: 'Synthetic conflict' } }, b]));
    expect(r.counts.quarantined).toBe(3);
  });
  it('never copies sensitive field values to quarantine output', () => {
    const r = legacyDryRun(
      input([{ ...row('SYN-A'), values: { password: 'SYNTHETIC-NOT-A-REAL-PASSWORD' } }]),
    );
    expect(r.counts.quarantined).toBe(1);
    expect(JSON.stringify(r)).not.toContain('SYNTHETIC-NOT-A-REAL-PASSWORD');
  });
  it('keeps case-sensitive identifiers distinct and quarantines compatibility-spelled sensitive keys', () => {
    expect(legacyDryRun(input([row('SYN-A'), row('SYN-a')])).counts.accepted).toBe(2);
    const report = legacyDryRun(
      input([{ ...row('SYN-X'), values: { ｐａｓｓｗｏｒｄ: 'SYN-SECRET' } }]),
    );
    expect(report.counts.quarantined).toBe(1);
    expect(JSON.stringify(report)).not.toContain('SYN-SECRET');
  });
  it('rejects missing references and cycles', () => {
    const r = legacyDryRun(
      input([
        { ...row('SYN-A'), references: ['SYN-B'] },
        { ...row('SYN-B'), references: ['SYN-A'] },
        { ...row('SYN-C'), references: ['SYN-MISSING'] },
      ]),
    );
    expect(r.counts.quarantined).toBe(3);
  });
  it('produces stable plans for reordered value properties and bounds source input', () => {
    const b = input([{ ...row('SYN-A'), values: { code: 'SYN-A', name: 'Synthetic' } }]);
    const c = {
      ...b,
      records: [
        {
          ...b.records[0],
          sourceId: 'SYN-A',
          entity: 'SUBJECT' as const,
          naturalKey: 'SYN-A',
          references: [],
          values: { name: 'Synthetic', code: 'SYN-A' },
        },
      ],
    };
    expect(legacyDryRun(b).planDigest).toBe(legacyDryRun(c).planDigest);
    expect(() =>
      legacyDryRun({ ...b, records: Array.from({ length: 1001 }, () => row('SYN-A')) }),
    ).toThrow();
  });
});
