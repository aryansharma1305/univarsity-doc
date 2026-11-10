import { createHash } from 'node:crypto';
import { canonicalJson, legacyDryRunSchema, type LegacyDryRun } from '@docversity/validation';
const hash = (v: unknown) => createHash('sha256').update(canonicalJson(v)).digest('hex');
const forbidden = /password|secret|token|aadhaar|national.?id|passport|pan.?number/i;
const targets = {
  REGISTRATION: 'StudentRegistration',
  SUBJECT: 'Subject',
  RESULT: 'Result',
  CERTIFICATE: 'Certificate',
  ADMISSION_LETTER: 'SyntheticRelease',
} as const;
/** Pure dry-run. It has no database/storage/account/issuance port and cannot import a record. */
export function legacyDryRun(value: LegacyDryRun) {
  const input = legacyDryRunSchema.parse(value);
  const rows = input.records.map((r, index) => ({
    index,
    sourceId: r.sourceId,
    entity: r.entity,
    naturalKey: r.naturalKey.normalize('NFKC').trim(),
    references: [...r.references],
    values: Object.fromEntries(
      Object.entries(r.values)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, typeof v === 'string' ? v.normalize('NFKC').trim() : v]),
    ),
  }));
  const groups = new Map<string, number[]>();
  for (const r of rows)
    for (const key of [`source:${r.sourceId}`, `target:${r.entity}:${r.naturalKey}`])
      groups.set(key, [...(groups.get(key) ?? []), r.index]);
  const conflict = new Set<number>();
  for (const indexes of groups.values())
    if (
      new Set(
        indexes.map((i) => {
          const r = rows[i];
          return hash({
            entity: r?.entity,
            naturalKey: r?.naturalKey,
            values: r?.values,
            references: r?.references,
          });
        }),
      ).size > 1
    )
      for (const i of indexes) conflict.add(i);
  const sources = new Map(rows.map((r) => [r.sourceId, r]));
  const status = new Map<number, string>();
  const reasons = new Map<number, string>();
  const seen = new Set<string>();
  for (const r of rows) {
    let reason: string | undefined;
    if (conflict.has(r.index)) reason = 'CONFLICTING_DUPLICATE';
    else if (!r.sourceId.startsWith('SYN-') || !r.naturalKey.startsWith('SYN-'))
      reason = 'SYNTHETIC_IDENTIFIERS_REQUIRED';
    else if (Object.keys(r.values).some((k) => forbidden.test(k.normalize('NFKC'))))
      reason = 'SENSITIVE_FIELD';
    else if (r.references.some((ref) => !sources.has(ref))) reason = 'MISSING_REFERENCE';
    if (reason) {
      status.set(r.index, 'QUARANTINE');
      reasons.set(r.index, reason);
    } else if (seen.has(`${r.entity}:${r.naturalKey}`) || seen.has(`source:${r.sourceId}`))
      status.set(r.index, 'DUPLICATE');
    else {
      status.set(r.index, 'ACCEPT');
      seen.add(`${r.entity}:${r.naturalKey}`);
      seen.add(`source:${r.sourceId}`);
    }
  }
  // A rejected/cyclic dependency cannot silently become an imported foreign key.
  const visiting = new Set<string>(),
    visited = new Set<string>(),
    cyclic = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) {
      for (const key of visiting) cyclic.add(key);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const ref of sources.get(id)?.references ?? []) visit(ref);
    visiting.delete(id);
    visited.add(id);
  };
  for (const r of rows) visit(r.sourceId);
  let remaining = rows.length;
  while (remaining > 0) {
    remaining -= 1;
    let changed = false;
    for (const r of rows)
      if (
        status.get(r.index) === 'ACCEPT' &&
        (cyclic.has(r.sourceId) ||
          r.references.some((ref) => {
            const target = sources.get(ref);
            return target && status.get(target.index) === 'QUARANTINE';
          }))
      ) {
        status.set(r.index, 'QUARANTINE');
        reasons.set(r.index, cyclic.has(r.sourceId) ? 'CYCLIC_REFERENCE' : 'QUARANTINED_REFERENCE');
        changed = true;
      }
    if (!changed) break;
  }
  const report = rows.map((r) => ({
    row: r.index,
    sourceId: r.sourceId,
    targetModel: targets[r.entity],
    status: status.get(r.index) ?? 'QUARANTINE',
    reason: reasons.get(r.index) ?? null,
    normalizedDigest: hash(r),
    ...(status.get(r.index) === 'ACCEPT' ? { proposedValues: r.values } : {}),
  }));
  const counts = {
    source: rows.length,
    accepted: report.filter((r) => r.status === 'ACCEPT').length,
    duplicates: report.filter((r) => r.status === 'DUPLICATE').length,
    quarantined: report.filter((r) => r.status === 'QUARANTINE').length,
  };
  if (counts.source !== counts.accepted + counts.duplicates + counts.quarantined)
    throw new Error('Reconciliation mismatch.');
  return {
    contractVersion: 1,
    usage: 'SYNTHETIC_ONLY',
    dryRun: true,
    importAllowed: false,
    sourceSystem: input.sourceSystem,
    sourceDigest: hash(input),
    planDigest: hash(report),
    counts,
    rows: report,
  };
}
