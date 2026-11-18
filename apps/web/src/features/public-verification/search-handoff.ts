import type { PublicVerificationService } from '@docversity/validation';

/**
 * One-shot handoff from the homepage search to a service page. The number never enters a URL, so
 * links from elsewhere cannot prefill or trigger a lookup (unsolicited references stay refused).
 */
const KEY = 'dv-hero-search';
const MAX_AGE_MS = 60_000;

export function storeHeroSearch(service: PublicVerificationService, reference: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ service, reference, at: Date.now() }));
  } catch {
    // Storage unavailable (private mode, blocked): the page opens empty and the user types again.
  }
}

/** Reads and removes the handoff; returns the number only for the matching, fresh service. */
export function takeHeroSearch(service: PublicVerificationService): string | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { service: stored, reference, at } = value as Record<string, unknown>;
    if (stored !== service || typeof reference !== 'string' || typeof at !== 'number') return null;
    if (Date.now() - at > MAX_AGE_MS || Date.now() < at) return null;
    return reference;
  } catch {
    return null;
  }
}
