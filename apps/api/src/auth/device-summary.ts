/**
 * A coarse "Browser on OS" label for the session list. Only this summary is stored — never the raw
 * User-Agent string.
 */
export function summariseUserAgent(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const browser =
    (userAgent.includes('Edg/') && 'Edge') ||
    (userAgent.includes('OPR/') && 'Opera') ||
    (userAgent.includes('Firefox/') && 'Firefox') ||
    (userAgent.includes('Chrome/') && 'Chrome') ||
    (userAgent.includes('Safari/') && 'Safari') ||
    (/curl\//i.test(userAgent) && 'curl') ||
    'Unknown browser';
  const os =
    (/iPhone|iPad|iPod/.test(userAgent) && 'iOS') ||
    (userAgent.includes('Android') && 'Android') ||
    (userAgent.includes('Windows') && 'Windows') ||
    (/Mac OS X|Macintosh/.test(userAgent) && 'macOS') ||
    (userAgent.includes('Linux') && 'Linux') ||
    'unknown OS';
  return `${browser} on ${os}`;
}
