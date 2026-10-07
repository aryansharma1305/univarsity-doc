import { describe, expect, it } from 'vitest';
import { getApiHealth } from '../src/lib/api-health';

const healthy = {
  status: 'ok',
  services: { api: 'ok', database: 'ok', redis: 'ok', storage: 'ok' },
};

function fakeFetch(respond: () => Promise<Response>): typeof fetch {
  return () => respond();
}

describe('getApiHealth', () => {
  it('returns the parsed health document when the API answers', async () => {
    const result = await getApiHealth('http://api.test', {
      fetchImpl: fakeFetch(() => Promise.resolve(Response.json(healthy))),
    });
    expect(result).toEqual({ reachable: true, health: healthy });
  });

  it('treats a 503 health document as reachable but unhealthy', async () => {
    const degraded = {
      ...healthy,
      status: 'error',
      services: { ...healthy.services, redis: 'error' },
    };
    const result = await getApiHealth('http://api.test', {
      fetchImpl: fakeFetch(() => Promise.resolve(Response.json(degraded, { status: 503 }))),
    });
    expect(result).toEqual({ reachable: true, health: degraded });
  });

  it('reports unreachable instead of guessing when the response is not a health document', async () => {
    const result = await getApiHealth('http://api.test', {
      fetchImpl: fakeFetch(() => Promise.resolve(Response.json({ hello: 'world' }))),
    });
    expect(result).toEqual({ reachable: false, reason: 'Unexpected response (HTTP 200)' });
  });

  it('reports unreachable when the connection fails', async () => {
    const result = await getApiHealth('http://api.test', {
      fetchImpl: fakeFetch(() => Promise.reject(new TypeError('fetch failed'))),
    });
    expect(result).toEqual({ reachable: false, reason: 'Connection failed' });
  });
});
