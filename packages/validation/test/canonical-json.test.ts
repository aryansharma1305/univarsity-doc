import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/canonical-json.js';
describe('durable JSON provenance', () => {
  it('retains digests after object keys are reordered by jsonb, without sorting arrays', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: [3, 1] } })).toBe(
      canonicalJson({ a: { b: [3, 1], y: 2 }, z: 1 }),
    );
    expect(canonicalJson([3, 1])).not.toBe(canonicalJson([1, 3]));
  });
  it('refuses unsupported numeric or executable values', () => {
    for (const v of [NaN, Infinity, 1n, () => 0]) expect(() => canonicalJson(v)).toThrow();
  });
});
