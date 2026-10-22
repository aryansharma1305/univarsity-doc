// Phase 14B: proves the reviewer gate from inside the backend network after every start.
// Anonymous and wrong-credential requests must be refused on every route class; robots.txt only is
// public. Exits non-zero on any other answer, so staging.py stops the proxy (fail closed).
import https from 'node:https';
import { readFileSync } from 'node:fs';
const origin = new URL(process.env.WEB_URL);
const ca = readFileSync('/credentials/local-ca.crt');
const { gate } = JSON.parse(readFileSync('/credentials/reviewers.json', 'utf8'));
const basic = (username, password) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const request = (path, method, authorization) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'proxy',
        port: 443,
        servername: origin.hostname,
        ...(ca.length > 1 ? { ca } : {}),
        path,
        method,
        timeout: 15000,
        headers: { Host: origin.host, ...(authorization ? { Authorization: authorization } : {}) },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(Error('Gate check deadline')));
    req.end();
  });
const failures = [];
const routes = [
  ['GET', '/'],
  ['GET', '/health'],
  ['GET', '/admin'],
  ['GET', '/admin/login'],
  ['GET', '/student/login'],
  ['GET', '/verify'],
  ['GET', '/api/v1/auth/csrf'],
  ['GET', '/api/v1/student/me'],
  ['POST', '/api/v1/auth/login'],
  ['POST', '/api/v1/public/verify/result'],
  ['GET', '/_next/static/missing.js'],
];
for (const [method, path] of routes)
  for (const [label, authorization] of [
    ['anonymous', null],
    ['wrong password', basic(gate.username, 'not-the-reviewer-password')],
    ['wrong user', basic('intruder', gate.password)],
  ]) {
    const status = await request(path, method, authorization);
    if (status !== 401) failures.push(`${label} ${method} ${path} → ${status}`);
  }
const robots = await request('/robots.txt', 'GET', null);
if (robots !== 200) failures.push(`robots.txt → ${robots}`);
const admitted = await request('/health', 'GET', basic(gate.username, gate.password));
if (admitted !== 200) failures.push(`reviewer /health → ${admitted}`);
if (failures.length) {
  console.error(`FAIL: reviewer gate\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(
  `PASS: reviewer gate refused ${routes.length * 3} anonymous/wrong-credential requests; robots.txt public; reviewer admitted.`,
);
