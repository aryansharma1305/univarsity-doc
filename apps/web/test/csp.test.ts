import { NextRequest } from 'next/server';
import { getScriptNonceFromHeader } from 'next/dist/server/app-render/get-script-nonce-from-header';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { POST as cspReport } from '@/app/csp-report/route';
import { createNonce, enforcedCsp, reportOnlyCsp } from '@/lib/csp';
import { config, proxy } from '@/proxy';

const directive = (policy: string, name: string) =>
  policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));

describe('CSP policies', () => {
  const enforced = enforcedCsp(false);
  const reportOnly = reportOnlyCsp('abc123==', false);

  it('locks everything except inline scripts in the enforced policy', () => {
    expect(directive(enforced, 'default-src')).toBe("default-src 'self'");
    expect(directive(enforced, 'object-src')).toBe("object-src 'none'");
    expect(directive(enforced, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(enforced, 'base-uri')).toBe("base-uri 'none'");
    expect(directive(enforced, 'connect-src')).toBe("connect-src 'self'");
    expect(directive(enforced, 'script-src')).toBe(
      "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
    );
    // A nonce in the enforced policy would switch off its 'unsafe-inline'.
    expect(enforced).not.toContain('nonce-');
    expect(enforced).not.toContain('unsafe-eval');
  });

  it('uses a nonce and strict-dynamic, never unsafe-inline scripts, in the report-only policy', () => {
    const scripts = directive(reportOnly, 'script-src') ?? '';
    expect(scripts).toContain("'nonce-abc123=='");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain('unsafe-inline');
    expect(reportOnly).toContain('report-uri /csp-report');
    // Next.js must find the nonce for its own inline scripts.
    expect(getScriptNonceFromHeader(reportOnly)).toBe('abc123==');
  });

  it('allows eval and the hot-reload websocket only in development', () => {
    expect(directive(enforcedCsp(true), 'script-src')).toContain("'unsafe-eval'");
    expect(directive(reportOnlyCsp('n', true), 'script-src')).toContain("'unsafe-eval'");
    expect(directive(enforcedCsp(true), 'connect-src')).toBe("connect-src 'self' ws:");
  });

  it('creates distinct 128-bit nonces Next.js accepts', () => {
    const a = createNonce();
    expect(atob(a)).toHaveLength(16);
    expect(a).not.toBe(createNonce());
    expect(getScriptNonceFromHeader(`script-src 'nonce-${a}'`)).toBe(a);
  });
});

describe('proxy', () => {
  beforeAll(() => {
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4000');
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('sets the nonce policy on pages and forwards only it (no enforced CSP) to rendering', () => {
    const response = proxy(
      new NextRequest('http://localhost:3000/admin/login', {
        headers: { 'content-security-policy': "script-src 'nonce-spoofed'" },
      }),
    );
    const reportOnly = response.headers.get('content-security-policy-report-only') ?? '';
    // Next.js prefers an enforced request header; it must never reach rendering (spoofed or ours).
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(response.headers.get('x-middleware-override-headers')).not.toMatch(
      /(^|,)content-security-policy(,|$)/,
    );
    const nonce = getScriptNonceFromHeader(reportOnly);
    expect(nonce).toBeTruthy();
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(response.headers.get('x-middleware-request-content-security-policy-report-only')).toBe(
      reportOnly,
    );
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('still rewrites the API without CSP headers', () => {
    const response = proxy(new NextRequest('http://localhost:3000/api/v1/auth/csrf'));
    expect(response.headers.get('x-middleware-rewrite')).toContain('/api/v1/auth/csrf');
    expect(response.headers.get('content-security-policy')).toBeNull();
  });

  it('matches the API and pages but not static assets or the report sink', () => {
    const [api, pages] = config.matcher;
    expect(api).toBe('/api/v1/:path*');
    const pageRe = new RegExp(`^${(pages ?? '').replace('/(', '/(?:')}$`);
    for (const path of ['/', '/admin/login', '/student/login', '/help']) {
      expect(pageRe.test(path), path).toBe(true);
    }
    for (const path of ['/_next/static/x.js', '/csp-report', '/api/v1/x', '/opengraph-image']) {
      expect(pageRe.test(path), path).toBe(false);
    }
  });
});

describe('POST /csp-report', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const post = (body: string) =>
    cspReport(new Request('http://localhost/csp-report', { method: 'POST', body }));

  it('logs only directive, blocked origin and page path', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await post(
      JSON.stringify({
        'csp-report': {
          'document-uri': 'https://verify.example/student/login?code=SECRET',
          'effective-directive': 'script-src-elem',
          'blocked-uri': 'https://evil.example/x.js?token=SECRET',
          'script-sample': 'SECRET',
          disposition: 'report',
        },
      }),
    );
    expect(response.status).toBe(204);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({
      msg: 'csp-violation',
      directive: 'script-src-elem',
      blocked: 'https://evil.example',
      page: '/student/login',
      disposition: 'report',
    });
    expect(line).not.toContain('SECRET');
  });

  it('rejects malformed and oversized reports', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect((await post('not json')).status).toBe(400);
    expect((await post(JSON.stringify({ other: 1 }))).status).toBe(400);
    expect((await post('x'.repeat(9000))).status).toBe(413);
  });
});
