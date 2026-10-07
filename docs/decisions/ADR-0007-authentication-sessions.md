# ADR-0007: Server-side Redis sessions with HTTP-only cookies (not browser-stored JWTs)

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

Docversity staff can publish results and issue or revoke certificates — actions that must be revocable
instantly (staff leave, accounts are compromised, roles change) and attributable in the audit log. The
API sits behind a same-origin Next.js proxy and Redis is already part of the stack.

## Decision

- Staff authenticate with email + password (Argon2id).
- The server issues an **opaque 256-bit session ID** in an **HttpOnly, Secure, SameSite=Lax,
  `__Host-`-prefixed** cookie. Session state lives in **Redis**, keyed by the SHA-256 of the ID, with a
  30-minute idle timeout and a 12-hour absolute lifetime.
- Unsafe requests require a CSRF token (session-derived HMAC; signed double-submit before login) plus an
  Origin check.
- Every request reloads the user's status and roles from PostgreSQL.
- No JWTs, and nothing authentication-related in `localStorage`/`sessionStorage`.

## Why not browser-stored JWTs

| Concern                                                | Redis session + HttpOnly cookie | JWT in browser storage                                               |
| ------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------- |
| XSS can read the credential                            | No (HttpOnly)                   | Yes (`localStorage` is script-readable)                              |
| Immediate revocation (logout, disable, password reset) | Delete the Redis key            | Needs a deny-list — i.e. server state anyway — or waiting for expiry |
| Role/status changes take effect                        | Next request (user reloaded)    | Only after the token expires or is refreshed                         |
| Idle timeout                                           | Natural (TTL refresh)           | Needs refresh-token machinery                                        |
| Token size / secrets in token                          | 43-char opaque ID               | Claims + signature; key management and algorithm pitfalls            |
| CSRF                                                   | Must be handled (we do)         | Avoided only by giving up HttpOnly                                   |

Stateless JWTs mainly help cross-domain/third-party APIs and large horizontally-scaled fleets without
shared state. Docversity is a single-university staff system with a shared Redis, where revocation and
auditability matter far more.

## Consequences

- Redis is on the authentication path: if it is down, sign-in and authenticated requests fail closed
  (503). Redis must be operated with persistence/HA appropriate for production.
- CSRF protection is mandatory for every mutating endpoint (global guard).
- The browser must reach the API through the web origin (same-origin proxy) so the cookie can be
  host-only.
- MFA and SSO can be added on top of this session model later (out of scope for Phase 3).
