import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const TRAINING_SAMPLE_SHA256 =
  '42624f64d67bbc6447b839b5b1136cdd450ca4bb5cb6bd6d54394a3daebd5d40';
let sample: Buffer | undefined;

/** Fixed, integrity-pinned Phase 12A output. No rendering, input, queries or storage writes. */
export function trainingCertificateSample(): Buffer {
  if (!sample) {
    const bytes = readFileSync(new URL('../assets/samples/training-v1.pdf', import.meta.url));
    if (
      bytes.length > 1_000_000 ||
      createHash('sha256').update(bytes).digest('hex') !== TRAINING_SAMPLE_SHA256
    )
      throw new Error('Training sample integrity check failed.');
    sample = bytes;
  }
  return Buffer.from(sample);
}
