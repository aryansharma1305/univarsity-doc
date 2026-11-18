import type { PublicVerificationService } from '@docversity/validation';

/**
 * One-shot handoff from the homepage search to a service page across a client-side navigation.
 * Kept in memory only: the number never enters a URL or browser storage, a reload clears it, and
 * links from elsewhere cannot prefill or trigger a lookup (unsolicited references stay refused).
 */
const MAX_AGE_MS = 60_000;
let pending: { service: PublicVerificationService; reference: string; at: number } | null = null;

export function storeHeroSearch(service: PublicVerificationService, reference: string): void {
  pending = { service, reference, at: Date.now() };
}

/** Removes the handoff; returns the number only for the matching service within a minute. */
export function takeHeroSearch(service: PublicVerificationService): string | null {
  const value = pending;
  pending = null;
  if (value?.service !== service) return null;
  const age = Date.now() - value.at;
  return age >= 0 && age <= MAX_AGE_MS ? value.reference : null;
}
