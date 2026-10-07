import { type HealthResponse, healthResponseSchema } from '@docversity/validation';

export type ApiHealthResult =
  /** The API answered with a valid health document (healthy or not). */
  | { reachable: true; health: HealthResponse }
  /** The API could not be reached or answered with something that is not a health document. */
  | { reachable: false; reason: string };

/**
 * Fetches GET /health from the API on the server. Never throws and never invents a status:
 * anything other than a schema-valid response is reported as unreachable.
 */
export async function getApiHealth(
  apiBaseUrl: string,
  { timeoutMs = 3_000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ApiHealthResult> {
  try {
    const response = await fetchImpl(new URL('/health', apiBaseUrl), {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
    // 503 is a valid answer: the API is up but a dependency is not.
    const parsed = healthResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { reachable: false, reason: `Unexpected response (HTTP ${response.status})` };
    }
    return { reachable: true, health: parsed.data };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? `No response within ${timeoutMs} ms`
        : 'Connection failed';
    return { reachable: false, reason };
  }
}
