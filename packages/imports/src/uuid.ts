import { randomBytes } from 'node:crypto';

/**
 * RFC 9562 UUID version 7 (time-ordered), matching the `uuid(7)` defaults of the schema. Used when a
 * batch insert needs the IDs before writing (createMany cannot return generated IDs in order).
 */
export function uuidv7(): string {
  const bytes = randomBytes(16);
  let time = Date.now();
  for (let index = 5; index >= 0; index--) {
    bytes[index] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
