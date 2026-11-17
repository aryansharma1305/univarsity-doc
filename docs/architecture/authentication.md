# Authentication

Staff/admin authentication only. There is no student login.

## Components

| Piece                                          | Where                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Endpoints                                      | `apps/api/src/auth/auth.controller.ts` (`/api/v1/auth/*`)                                   |
| Login, logout, sessions, password change/reset | `auth.service.ts`                                                                           |
| Redis sessions                                 | `session.store.ts`                                                                          |
| CSRF tokens                                    | `csrf.service.ts`, `csrf.guard.ts`                                                          |
| Login throttling                               | `rate-limiter.ts`                                                                           |
| Argon2id                                       | `password.service.ts`                                                                       |
| Cookie settings                                | `cookies.ts`                                                                                |
| Global guards                                  | `auth.guard.ts` → `csrf.guard.ts` → `permissions.guard.ts` (registered in that order)       |
| Shared schemas & password policy               | `packages/validation/src/auth`                                                              |
| Web                                            | `apps/web/src/proxy.ts` (same-origin proxy), `lib/server-auth.ts`, `/admin/login`, `/admin` |
| First admin                                    | `pnpm admin:create`                                                                         |

## Request path

```text
Browser ──HTTPS──► Next.js (web origin)
                    │  /api/v1/*  → src/proxy.ts rewrites to API_INTERNAL_URL (same origin for the browser)
                    │  /admin     → server component calls GET /api/v1/auth/me with the browser's cookies
                    ▼
                 NestJS API ──► Redis (sessions, rate limits, reset tokens)
                            └─► PostgreSQL (users, roles, audit_logs)
```

The browser only ever talks to the web origin, so the session cookie is **host-only on the web origin**
(`__Host-` prefixed in production) and the browser needs no cross-origin requests.

## Login flow

1. `GET /api/v1/auth/csrf` (signed out) → sets the HttpOnly `dv_csrf` cookie and returns the same signed
   token in the body.
2. `POST /api/v1/auth/login` with `X-CSRF-Token: <token>` and `{ email, password }`.
3. The API validates the body with the shared Zod schema (email trimmed + lower-cased).
4. **Throttle first:** three Redis counters are incremented (see Rate limiting). Over the limit → `429`
   without touching the database or Argon2.
5. Load the user; verify the password with Argon2id. Unknown emails (and accounts without a password) are
   verified against a dummy hash, so timing is the same.
6. Any failure (unknown account, wrong password, disabled account) → the same
   `401 AUTH_INVALID_CREDENTIALS` "Unable to sign in with those credentials." + an
   `AUTH_LOGIN_FAILURE` audit entry (reason + keyed hashes of email/IP only).
7. Success → clear the account counters, **revoke any session the browser already had** (fixation
   defence), create a new session, set the session cookie, clear the pre-auth CSRF cookie, audit
   `AUTH_LOGIN_SUCCESS`, return `{ id, email, displayName, roles, permissions }`.

## Sessions

- Session ID: 32 bytes from the OS CSPRNG, base64url (256 bits). It exists only in the browser cookie.
- Redis stores the session under **`sha256(sessionId)`**, so a Redis dump cannot be replayed as cookies.

| Redis key                        | Value                                                                            | TTL                                        |
| -------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ |
| `dv:session:<sha256(sessionId)>` | `{ publicId, userId, createdAt, lastSeenAt, absoluteExpiresAt, device, ipHash }` | min(idle timeout, time to absolute expiry) |
| `dv:user-sessions:<userId>`      | SET of session hashes (listing, revoke-all)                                      | absolute lifetime                          |
| `dv:rl:<scope>:<key>`            | attempt counter                                                                  | rate-limit window                          |
| `dv:pwreset:<sha256(token)>`     | userId                                                                           | reset-token TTL                            |
| `dv:pwreset-user:<userId>`       | sha256 of the user's current reset token                                         | reset-token TTL                            |

No passwords, raw IPs, raw User-Agents, raw emails or CSRF tokens are stored. `device` is a coarse
"Chrome on macOS" summary; `ipHash`/email hashes are HMAC-SHA256 with `SESSION_SECRET`.

**Lifetimes (final values):**

| Setting           | Value                                                                  | Env                                      |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| Idle timeout      | **30 minutes**                                                         | `SESSION_IDLE_TIMEOUT_SECONDS=1800`      |
| Absolute lifetime | **12 hours**                                                           | `SESSION_ABSOLUTE_TIMEOUT_SECONDS=43200` |
| Cookie            | browser-session cookie (no Max-Age) — closing the browser also ends it | —                                        |

Every authenticated request reloads the user (status + roles) from PostgreSQL and refreshes the idle
window, never beyond the absolute expiry. A disabled user's sessions are revoked on their next request.

**Revocation** (`SessionStore`): `revoke(sessionId)` (logout), `revokeByPublicId` (session list),
`revokeAllForUser(userId, { exceptSessionId })` — used by password change (others), MFA enrollment
(others), password reset (all), staff access reset (all) and `UsersService.disableUser` (all).

**Redis unavailable → fail closed.** Every Redis call has a 2-second deadline; failures become
`503 AUTH_SERVICE_UNAVAILABLE`. A request is never treated as authenticated without reading its session.
`/health` keeps reporting `redis: error`.

## Cookies

|                   | Session                                                                                                  | Pre-auth CSRF    |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ---------------- |
| Name (production) | `__Host-dv_session`                                                                                      | `__Host-dv_csrf` |
| Name (local http) | `dv_session`                                                                                             | `dv_csrf`        |
| HttpOnly          | yes                                                                                                      | yes              |
| Secure            | yes (`COOKIE_SECURE=true`; false is rejected in production and allowed only when `WEB_URL` is localhost) | same             |
| SameSite          | `Lax`                                                                                                    | `Strict`         |
| Path / Domain     | `/` / none (host-only)                                                                                   | `/` / none       |
| Lifetime          | browser session; server enforces 30 min idle / 12 h absolute                                             | 30 minutes       |

`SameSite=Lax` (not Strict) so that following a link to `/admin` from email or another site still arrives
signed in; cross-site _mutations_ are still blocked by CSRF tokens and the Origin check.

## CSRF

Every `POST`/`PUT`/`PATCH`/`DELETE` is checked by the global `CsrfGuard`; `GET`/`HEAD`/`OPTIONS` are not.

1. **Origin check.** If the request has an `Origin` header it must be `WEB_URL` or in `CORS_ORIGINS`
   (`403 ORIGIN_NOT_ALLOWED`).
2. **Token check** (`403 CSRF_INVALID`):
   - **Signed in — synchronizer token derived from the session:**
     `HMAC-SHA256(SESSION_SECRET, "csrf:" + sessionId)`. Not stored anywhere; it changes whenever the
     session changes (login rotates it) and can't be computed without the server secret and the HttpOnly
     session cookie.
   - **Signed out — signed double-submit** (login, forgot/reset password, marked `@CsrfPreAuth()`):
     `nonce.HMAC(SESSION_SECRET, "pre-auth-csrf:" + nonce)` in the `dv_csrf` cookie and echoed in the header.
     Cross-site pages can't read the token, and can't plant a validly signed `__Host-` cookie.

**How the web app sends it** (`apps/web/src/lib/api-client.ts`): before each unsafe request,
`GET /api/v1/auth/csrf` (same origin, cookies included automatically) → send the returned `csrfToken` as
`X-CSRF-Token`. Tokens are never put in `localStorage`, cookies readable by JavaScript, or URLs.

## Rate limiting

Fixed-window Redis counters, incremented **before** credentials are checked (throttled requests never
reach Argon2 or PostgreSQL). Keys are HMAC hashes — never raw emails or IPs.

| Bucket                  | Default per 15 min | Purpose                                             |
| ----------------------- | ------------------ | --------------------------------------------------- |
| account + client IP     | **5**              | Online guessing from one client                     |
| account (any IP)        | **20**             | Distributed guessing against one account            |
| client IP (any account) | **100**            | Credential stuffing; generous for shared campus NAT |

A successful login clears the account + IP and account buckets. When limited: `429 AUTH_RATE_LIMITED`
with `Retry-After`; the response is identical for existing and unknown accounts. The first throttled
attempt in a window is audited (`reason: rate_limited`), not every attempt. Also limited: password change
(5 / 15 min per user), forgot-password (3 / hour per account, 20 / hour per IP).

**Client IP and proxy trust.** The API takes the client IP from Express `req.ip` with an explicit
`TRUST_PROXY` (`false` | `loopback` | IP/CIDR list | hop count; `true` is rejected).

- **Local development:** the Next.js server is the edge. Its proxy **drops** any client-supplied
  `X-Forwarded-For`/`X-Real-IP` (`WEB_BEHIND_TRUSTED_PROXY=false`), and the API trusts no proxy
  (`TRUST_PROXY=false`). All local browser traffic therefore shares one IP — fine for development.
  (Verified: Next.js forwards a client's `X-Forwarded-For` unchanged and adds nothing, so passing it
  through at the edge would let clients choose their IP.)
- **Production behind a load balancer:** the load balancer must _append_ the real client IP to
  `X-Forwarded-For`. Set `WEB_BEHIND_TRUSTED_PROXY=true` on the web server and
  `TRUST_PROXY=<web server IPs/CIDRs>,<load balancer IPs/CIDRs>` on the API. The API must not be
  reachable except through the web server.

## Logout and session management

| Endpoint                           | Behaviour                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/logout`         | Revokes the current session, clears the cookie, audits `AUTH_LOGOUT`. Returns `200 { ok: true }` even without a session |
| `GET /api/v1/auth/sessions`        | Own live sessions: `{ id (public handle), createdAt, lastSeenAt, expiresAt, device, current }`                          |
| `DELETE /api/v1/auth/sessions/:id` | Revoke one own session (`AUTH_SESSION_REVOKED`)                                                                         |
| `DELETE /api/v1/auth/sessions`     | Revoke all own sessions except the current one                                                                          |

## Passwords

- **Argon2id**, OWASP-recommended parameters: **memory 19 456 KiB (19 MiB), time cost 2, parallelism 1**,
  random 16-byte salt, PHC string format (`$argon2id$v=19$m=19456,t=2,p=1$…`).
- **Policy** (`packages/validation/src/auth/password-policy.ts`): 12–128 characters (code points); no
  composition rules; rejects a deny-list of common passwords, single-character repeats and keyboard/number
  sequences, and passwords containing the email local-part or display name.
- **Change password** (`POST /api/v1/auth/password`): current password required, policy enforced, all
  other sessions revoked, `AUTH_PASSWORD_CHANGED` audited.

## Password reset (backend foundation)

- `POST /api/v1/auth/forgot-password` → single-use 256-bit token; only `sha256(token)` is stored in Redis
  (30 min TTL); a new request invalidates the previous token; the link carries the token in the URL
  **fragment** (`/admin/reset-password#token=…`) so it never reaches server logs or `Referer`.
- `POST /api/v1/auth/reset-password` → policy checked **before** the token is consumed; token consumed
  atomically (`GETDEL`); password replaced; **all** sessions revoked; `AUTH_PASSWORD_RESET` audited.
- **Email delivery does not exist yet.** The default `PasswordResetNotifier` reports "not configured", and
  forgot-password answers `503 PASSWORD_RESET_UNAVAILABLE` for every address — it never pretends an email
  was sent. The reset page in the web app is not built yet. Until mail is available, an administrator
  resets passwords out of band.

## First admin

```bash
pnpm admin:create                      # interactive; password typed twice, hidden
ADMIN_EMAIL=… ADMIN_DISPLAY_NAME=… ADMIN_PASSWORD=… pnpm admin:create   # non-interactive (CI/automation)
```

Builds the API, ensures the code-defined roles exist, validates the email and password policy, refuses
existing emails, creates the user with `SUPER_ADMIN`, records `ADMIN_CREATED`, and prints only the email
and user ID. There are no default credentials and nothing creates an admin automatically (the development
seed creates no users).

The account is created with `password_change_required = true`: at first sign-in the person must replace
the operator-chosen password before anything else works (see below).

## First-login password change and authenticator-app MFA (ADR-0021)

Details and rationale: [ADR-0021](../decisions/ADR-0021-staff-mfa-and-first-login.md).

**Restricted sessions.** On every request the `AuthGuard` derives the session's _next step_
(`staff-steps.ts`): `MFA_VERIFY` (password verified, code pending) → `PASSWORD_CHANGE`
(`password_change_required`) → `MFA_ENROLL` (`STAFF_MFA_ENFORCED=true` and no authenticator). While a
step is pending the session has **no permissions** and reaches only `GET /auth/me`, `GET /auth/csrf`,
`POST /auth/logout`, the login/reset endpoints and the step's own endpoint; anything else answers
`403 MFA_REQUIRED` / `PASSWORD_CHANGE_REQUIRED` / `MFA_ENROLLMENT_REQUIRED`. `AuthUser` carries
`nextStep` and `mfaEnabled`; the web app redirects to `/admin/login/verify`, `/admin/security/password`
or `/admin/security/mfa`.

| Endpoint                                    | Step / access           | Behaviour                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/password`                | full or PASSWORD_CHANGE | New password must differ; clears the flag; revokes other sessions                                                                                                                                                                                                                                               |
| `POST /api/v1/auth/mfa/enrollment`          | full or MFA_ENROLL      | New secret, returned once (base32, otpauth URI, SVG QR); kept encrypted in Redis for 10 min                                                                                                                                                                                                                     |
| `POST /api/v1/auth/mfa/enrollment/confirm`  | full or MFA_ENROLL      | `{ currentPassword, code }`: needs a live enrollment (else `400 MFA_ENROLLMENT_EXPIRED`, before any password check); re-authenticates (Argon2, sign-in limits), activates MFA; 10 recovery codes once (always, once committed); new session ID or `reauthenticate: true`; revokes other sessions; `MFA_ENABLED` |
| `POST /api/v1/auth/mfa/verify`              | MFA_VERIFY only         | `{ code }` or `{ recoveryCode }`; consumes the pending session atomically and creates a new one; `AUTH_MFA_VERIFIED`                                                                                                                                                                                            |
| `GET /api/v1/staff-users`                   | `users.manage`          | Staff with status, `mfaEnabled`, `passwordChangeRequired`                                                                                                                                                                                                                                                       |
| `POST /api/v1/staff-users/:id/access-reset` | `users.manage`          | Removes MFA + recovery codes, **required** `temporaryPassword` replaces the password, sets the flag, clears the MFA lockout, revokes all sessions                                                                                                                                                               |
| `POST /api/v1/staff-users/:id/disable`      | `users.manage`          | Reason code; `USER_DISABLED`; revokes all sessions; refuses self and the last active SUPER_ADMIN (checked under an advisory lock in the same transaction)                                                                                                                                                       |

**TOTP.** RFC 6238, HMAC-SHA1, 6 digits, 30 s, 160-bit secret, ±1 step. Secrets are AES-256-GCM
encrypted with a key derived from `STAFF_MFA_ENCRYPTION_KEY` (bound to the user ID). A step is accepted
at most once (`mfa_totp_last_used_step`, compare-and-set). Pending sessions (`stage: "mfa"` in Redis)
live 5 minutes and use a separate credential-binding domain. A verify request first takes an exclusive
Redis claim on its pending session (a concurrent verify gets `409`, without spending a code), and on
success consumes the pending session with `GETDEL`; if it is already gone no full session is created.

**MFA throttling and lockout.** Verification has its own, tighter limits (scope `mfa`, checked before
any code is compared): `MFA_MAX_ATTEMPTS_PER_ACCOUNT_IP` (default 5), `MFA_MAX_ATTEMPTS_PER_ACCOUNT`
(default 5) and `MFA_MAX_ATTEMPTS_PER_IP` (default 50) per `MFA_RATE_LIMIT_WINDOW_SECONDS` (default 900).
A success clears only the account+IP counter, never the per-account one. Every wrong code also counts
towards an escalating lockout: `MFA_LOCKOUT_THRESHOLD` (default 10) wrong codes within
`MFA_LOCKOUT_WINDOW_SECONDS` (default 24 h) lock verification for the account for `MFA_LOCKOUT_SECONDS`
(default 24 h) — `429 MFA_LOCKED` with `Retry-After` — or until a SUPER_ADMIN access reset; further
wrong codes inside the window re-arm it. Failures are audited `AUTH_MFA_FAILURE`, each new lock
`AUTH_MFA_LOCKED`. Enrollment confirmation requires the current password and uses the sign-in limits
(scope `mfa-enroll`); every attempt that reaches the password check also counts against the account's
**sign-in** bucket (scope `login`, `LOGIN_MAX_ATTEMPTS_PER_ACCOUNT`), so a stolen session gets no
separate password-guessing budget — once it is spent, enrollment confirmation and normal sign-in for
the account are both throttled. Without a live enrollment (none started, or the 10-minute secret
expired) the request is refused with `400 MFA_ENROLLMENT_EXPIRED` before any counter is touched or any
password is checked.

**Enrollment after the commit.** Enabling MFA and storing the recovery-code hashes is one transaction;
no codes are returned unless it commits. After it commits the codes are **always** returned and every
later step is best-effort (failures are logged by step name and audited once as
`MFA_ENROLLMENT_CLEANUP_INCOMPLETE`): (1) revoke the current session (`GETDEL`); (2) only if that
succeeded, create the rotated session; (3) revoke all other sessions (all of them if no rotated session
exists); (4) drop the enrollment secret, the MFA lockout history and the enrollment counter. If no
rotated session exists, the response has `reauthenticate: true` and `user: null`, the cookie is cleared,
and the web app sends the user to sign in again after they have saved the codes. Independently of
Redis, the `AuthGuard` refuses every full session created before `users.mfa_enabled_at`, so an
un-rotated pre-enrollment session can never stay usable even if every revocation failed.

**Shared client IPs and the MFA per-IP limit (proposal — requires security review, not implemented).**

_Finding._ `MFA_MAX_ATTEMPTS_PER_IP` (50 per 15 min) counts **every** verify attempt, including
successful ones, and a success clears only the account+IP counter (`mfa.service.ts`, `throttle('mfa')`
before the code check, `rateLimiter.clear('mfa', [pair])` after). The per-IP counter is never
refunded. Staff who sign in from one campus NAT therefore share one bucket: the 51st second-factor
step from that address within a window gets `429 AUTH_RATE_LIMITED`, even if every attempt was
correct. (Password sign-in has the same shape at 100 per IP — documented above as "generous for shared
campus NAT" — so with MFA the tighter MFA bucket is the first to run out.)

_Does production see real client IPs?_ Yes, as seen by the edge Caddy, provided nothing else sits in
front of it:

- The university runtime generated by `deploy/university/clean.py` sets `TRUST_PROXY=2` (API) and
  `WEB_BEHIND_TRUSTED_PROXY=true` (web); the chain is Caddy → Next.js → API.
- Caddy (`deploy/university/clean.py` `caddyfile()`, the shared edge in `deploy/coexist/prepare.py`,
  `deploy/review-site.caddy`) **replaces** `X-Forwarded-For` with exactly one value, `{client_ip}`.
  None of those Caddyfiles configures `trusted_proxies`, so `{client_ip}` is Caddy's TCP peer. The
  shared edge publishes `80:80`/`443:443`; Docker's DNAT preserves the external source address.
- Next.js passes that header through unchanged and adds nothing (verified earlier, see "Client IP and
  proxy trust"). Express with hop count 2 trusts the socket peer (Next.js) and one more hop, so with a
  single forwarded entry `req.ip` is that entry: the real client address (checked against
  `proxy-addr`: one entry `203.0.113.7` → `203.0.113.7`).
- Caveats: if a CDN or provider load balancer is ever put in front of the shared edge, `{client_ip}`
  becomes the CDN's address and every user shares a handful of IPs; Caddy then needs
  `trusted_proxies` for that CDN (as the Render edge already does with `trusted_proxies_strict`). The
  private `127.0.0.1:<port>` university instance sees the Docker gateway for all local traffic, which is
  acceptable only because it is not public.

So the API sees real client addresses, and on a campus those really are one NAT address for many staff.

_Proposal._ Count only **failed** second-factor attempts toward the per-IP MFA bucket; leave everything
else unchanged:

1. Keep `throttle('mfa')` exactly as it is: all three buckets (account+IP 5, account 5, IP 50) are
   incremented **before** the code is compared, so concurrent requests are still bounded and a
   throttled request never reaches the database.
2. After a **successful** verify, refund the one unit this request added to the IP bucket (`DECR` on
   the `rl:mfa:ip:<hash>` key, floored at 0; a no-op if the window has already rolled over). The
   account+IP counter is still cleared, as now. The per-account counter is **not** refunded (a success
   must never refill the per-account allowance — unchanged), and the 24 h escalating lockout is
   untouched.
3. No change to `MFA_*` defaults, to the sign-in `LOGIN_*` buckets, or to enrollment.

_Threat analysis._

- To reach `POST /auth/mfa/verify` at all, an attacker needs a pending session, i.e. the account's
  **password** (and must pass the sign-in limits for it).
- Guessing codes against one account stays bounded by the per-account (5 per 15 min) and
  per-account+IP (5) buckets, which keep counting every attempt, and by the lockout (10 wrong codes per
  24 h). None of these is changed.
- The per-IP bucket exists to stop **spraying across many accounts** from one address (an attacker
  holding many stolen passwords). Spraying consists of wrong codes, which still consume the bucket in
  full; a refund happens only for a correct code — which already means that account is compromised and
  the per-IP limit would not have prevented it.
- A refund cannot create budget: each success returns only the unit it consumed, so the bucket
  converges to "wrong codes per IP per window". Concurrency is unchanged (the unit is held while the
  request runs). An attacker with one valid account cannot launder failures for other accounts.
- Residual risk: an attacker who controls many accounts' passwords and one account's authenticator
  gains nothing beyond the per-account limits that already apply to each target.

_Alternatives considered._ Raising `MFA_MAX_ATTEMPTS_PER_IP` weakens spraying protection for every
deployment; an allow-list of campus egress addresses with a higher limit needs operator data and still
counts successes. Neither is proposed.

_Before implementation:_ security review of this section; a regression test that N successful verifies
from one IP do not consume the IP bucket while N wrong codes do; and a decision whether the same
refund should apply to the password sign-in per-IP bucket (out of scope here).

**Recovery codes.** 10 × 50-bit codes `XXXXX-XXXXX` (case, spaces and hyphens ignored), stored only as
keyed HMACs in `staff_mfa_recovery_codes`, each spent once (`MFA_RECOVERY_CODE_USED` with the remaining
count).

**When nobody can sign in** (break glass, on the server):

```bash
pnpm staff:reset-access                                        # prompts; temporary password hidden
STAFF_EMAIL=… STAFF_TEMP_PASSWORD=… pnpm staff:reset-access    # non-interactive
```

Removes the authenticator and recovery codes, sets the temporary password and the password-change flag,
audits `STAFF_ACCESS_RESET (via: cli)`. Existing sessions stop working at once (bound to the password
hash). Email reset stays disabled.

**Configuration.** `STAFF_MFA_ENCRYPTION_KEY` (64 hex chars, never equal to `SESSION_SECRET`) is
required in production and whenever `STAFF_MFA_ENFORCED=true`; without it (development only) enrollment answers `503 MFA_UNAVAILABLE`.
`STAFF_MFA_ENFORCED` defaults to `false`; switching it on requires every staff member without MFA to
enroll at their next request.

## Correlation IDs and logs

Every request gets an ID (a well-formed inbound `X-Request-Id` — 8–128 chars of `[A-Za-z0-9._:-]` — is
reused; otherwise a UUID). It is returned in `X-Request-Id`, included in every log line, in error bodies
(`error.requestId`) and in audit entries (`correlation_id`). Logs are JSON lines; keys matching
password/secret/token/cookie/authorization/session-id/csrf/credential/api-key are redacted at any depth,
and the access log records the path without the query string.

## Student portal authentication (Phase 6)

Students are a **separate principal**. They never become `users`, never hold roles or permissions, and
cannot reach any staff endpoint. See [ADR-0010](../decisions/ADR-0010-student-authentication.md).

| Aspect        | Staff                                          | Students                                                                                                   |
| ------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Identity      | `users`                                        | `student_accounts` (one per student, covering all of their registrations)                                  |
| Sign-in       | `POST /api/v1/auth/login` (email + password)   | `POST /api/v1/student-auth/login` (any of the student's registration numbers + password)                   |
| First access  | `pnpm admin:create` / staff tooling            | `POST /api/v1/student-auth/activate` — registration number **+ single-use activation code** + new password |
| Cookie        | `dv_session` / `__Host-dv_session`             | `dv_student` / `__Host-dv_student` (same flags: HttpOnly, SameSite=Lax, Secure in production)              |
| Redis         | `<prefix>session:*`, `<prefix>user-sessions:*` | `<prefix>student-session:*`, `<prefix>student-sessions:*`                                                  |
| Guard         | `AuthGuard` (reads only the staff cookie)      | `StudentAuthGuard` (only on `@StudentRoute()` routes, reads only the student cookie)                       |
| CSRF          | session token from `GET /auth/csrf`            | session token from `GET /student-auth/csrf` (pre-auth double-submit for activate/login)                    |
| Authorization | code-defined permissions                       | none: every student endpoint derives the student from the session                                          |

Global guard order: `AuthGuard` → `StudentAuthGuard` → `CsrfGuard` → `PermissionsGuard`. Student routes
are marked `@StudentRoute()`, which makes the staff guard skip them (`AUTH_MODE = none`), so a staff
session is never accepted there; staff routes never read the student cookie.

### Activation codes

- Issued by staff with `studentAccounts.manage` (`POST /api/v1/student-accounts/activation-codes`) for
  selected registrations or every registration of an import; printed and delivered by the university.
- 12 symbols from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no look-alikes) — 60 bits from the CSPRNG,
  formatted `XXXX-XXXX-XXXX`; input ignores case, spaces and dashes.
- Stored only as `HMAC-SHA256(SESSION_SECRET, "student-activation:" + code)`; the plain code is in the
  issuing response only (`Cache-Control: no-store`) and is never logged or audited.
- Single use (compare-and-set on `used_at`), expire after `STUDENT_ACTIVATION_CODE_TTL_DAYS` (30), at most
  one open code per registration (partial unique index); re-issuing revokes the previous code.
- **The registration number alone is never sufficient.** Every failure (unknown number, wrong/used/
  expired/revoked code, revoked registration, disabled account) returns the same
  `400 STUDENT_ACTIVATION_FAILED`. Wrong codes for a registration count against its open code, which is
  revoked after `STUDENT_ACTIVATION_MAX_FAILED_ATTEMPTS` (10); attempts are also throttled per
  registration (5) and per IP (30) per window.
- **Recovery:** a code issued for a student who already has an account sets a new password, re-activates a
  LOCKED account and ends all of that account's sessions. DISABLED accounts are never recoverable by
  code (staff must re-activate them first).
- The password policy is checked before the code is consumed, so a weak password does not burn the code.

### Account status

`ACTIVE`, `LOCKED`, `DISABLED` (reason required). Any change away from ACTIVE ends all of the account's
sessions immediately; the guard reloads the account on every request.
