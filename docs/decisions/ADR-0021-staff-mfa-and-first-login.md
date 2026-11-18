# ADR-0021: Staff first-login password change and authenticator-app MFA

Status: proposed (feature branch `feature/staff-mfa-first-login`). Production enablement is an
operator decision (see "Rollout").

## Context

Staff accounts are bootstrapped by an operator (`pnpm admin:create`, `create-staff.js --role …`), so the
first password is known to someone other than the account holder. Staff hold the authority to change
academic records; a password alone is a single factor. Email-based password reset stays disabled (no
notifier is configured), so recovery must work without email.

## Decision

1. **Mandatory first-login password change.** CLI-created accounts get
   `users.password_change_required = true`. The `AuthGuard` derives a _next step_ for every staff
   request from the session record and the freshly loaded user (`apps/api/src/auth/staff-steps.ts`):
   `MFA_VERIFY` → `PASSWORD_CHANGE` → `MFA_ENROLL`. A session with a step reaches only routes marked
   `@AllowDuringStep(step)` (me, csrf, logout, login/reset endpoints, and the step's own endpoint);
   every other staff route answers `403` with `MFA_REQUIRED`, `PASSWORD_CHANGE_REQUIRED` or
   `MFA_ENROLLMENT_REQUIRED`, and restricted sessions carry **no permissions**. The web app only
   redirects; the server decides. Changing the password (which must differ from the current one)
   clears the flag and revokes the other sessions.
2. **TOTP (RFC 6238) with an in-repo implementation** (`apps/api/src/auth/totp.ts`, ~100 lines,
   `node:crypto` only), tested against the RFC 4226 and RFC 6238 Appendix B vectors. The repository had
   no OTP library; a minimal implementation avoids a new security-critical dependency. Parameters are
   the interoperable defaults: HMAC-SHA1, 6 digits, 30 s, 160-bit secret, ±1 step window.
   - **Enrollment:** the server generates the secret, returns it once (base32, `otpauth://` URI and an
     SVG QR code) and keeps it encrypted in Redis for 10 minutes; it becomes active only after the
     user re-enters their **current password** (Argon2 check, sign-in rate limits, scope
     `mfa-enroll`, plus the sign-in per-account bucket shared with `POST /auth/login`) together with a
     valid code (`POST /auth/mfa/enrollment/confirm`), so a stolen session alone cannot bind an
     attacker's authenticator and gets no separate password-guessing budget. The pending enrollment is
     loaded first: without one (`400 MFA_ENROLLMENT_EXPIRED`) no counter is consumed and no password is
     checked. Confirmation rotates the session ID (as verification does) and ends every other session.
   - **Codes are never lost:** once the enabling transaction commits, the recovery codes are always
     returned; session rotation and cleanup are best-effort (audited `MFA_ENROLLMENT_CLEANUP_INCOMPLETE`).
     The current session is revoked _before_ the rotated one is created; if rotation fails the
     response says `reauthenticate: true` and the user signs in again.
   - **Session binding:** every staff session's credential HMAC also covers `users.mfa_enabled_at`
     (omitted when MFA is off, so earlier sessions and rollback are unaffected). Sessions authenticated
     under a different MFA state — un-rotated pre-enrollment sessions, sessions whose Redis revocation
     failed, and a password-only login racing the enrollment commit — stop matching from the next
     request; sessions from `POST /auth/mfa/verify` are bound to the authenticator that accepted the
     code. Endpoints that create or rebind sessions (MFA verification, password change) re-check the
     session against the freshly read account before doing so. The check is per request: a read-only
     request already past the guard at commit time still completes.
     See [authentication.md](../architecture/authentication.md) for the full list of limits.
   - **At rest:** AES-256-GCM, key derived by HKDF from `STAFF_MFA_ENCRYPTION_KEY` (64 hex chars), the
     user ID as associated data (a ciphertext copied to another row does not decrypt).
   - **Login is two steps.** A correct password for an MFA account creates a _pending_ session
     (`stage: 'mfa'`, 5-minute absolute lifetime) that can only call `POST /auth/mfa/verify`. Success
     replaces it with a **new** session ID (fixation defence). The pending session is single use: a
     verify request takes an exclusive Redis claim on it before any code is spent (concurrent verifies
     get `409`) and consumes it with `GETDEL` before creating the full session, so one pending session
     yields at most one full session. Pending sessions use a separate
     credential-binding HMAC domain, so any reader that ignores `stage` — including release 70b11d2 on
     the same Redis — rejects them instead of treating them as full sessions.
   - **Replay protection:** `users.mfa_totp_last_used_step` is advanced with a compare-and-set; a step
     at or below it is never accepted (each code works once, and older codes stop working).
   - **Rate limiting:** dedicated, tighter limits for a 10^6-value code (`MFA_MAX_ATTEMPTS_PER_ACCOUNT_IP`
     5, `MFA_MAX_ATTEMPTS_PER_ACCOUNT` 5, `MFA_MAX_ATTEMPTS_PER_IP` 50 per
     `MFA_RATE_LIMIT_WINDOW_SECONDS` 900) in an own `mfa` scope, checked before any code is compared;
     the first throttled attempt per window is audited. A success clears only the account+IP counter,
     never the per-account counter, and gives back its per-IP unit, so staff behind one campus NAT
     share a bucket of wrong codes only (implemented after security review; failures still count in
     full), as analysed in
     [authentication.md](../architecture/authentication.md#first-login-password-change-and-authenticator-app-mfa-adr-0021)
     ("Shared client IPs and the MFA per-IP limit").
   - **Escalating lockout:** `MFA_LOCKOUT_THRESHOLD` (10) wrong codes within
     `MFA_LOCKOUT_WINDOW_SECONDS` (24 h) lock verification for the account for `MFA_LOCKOUT_SECONDS`
     (24 h) or until a SUPER_ADMIN access reset (`429 MFA_LOCKED`, audited `AUTH_MFA_LOCKED`); further
     wrong codes inside the window re-arm it. With the defaults an attacker gets at most 10 guesses a
     day (success probability ≈ 3 × 10⁻⁵ per day with the ±1 step window).
   - **Enforcement:** `STAFF_MFA_ENFORCED=true` makes every staff account without MFA enroll before
     anything else (step `MFA_ENROLL`). Default `false`.
3. **Recovery.** Ten single-use recovery codes (50 bits each, `XXXXX-XXXXX`) are issued at enrollment
   and shown once; only `HMAC-SHA256(HKDF(key, "recovery-code"), userId‖code)` is stored
   (`staff_mfa_recovery_codes`), spent by a compare-and-set on `used_at`. A SUPER_ADMIN (`users.manage`)
   can reset another member's access (`POST /api/v1/staff-users/:id/access-reset`: removes MFA and
   recovery codes, replaces the password with a **required**, policy-checked temporary password — so
   anyone who knew the old password is locked out — sets the password-change flag, clears the MFA
   lockout, revokes all sessions; audited `STAFF_ACCESS_RESET`). When no administrator can sign in, the operator CLI
   `pnpm staff:reset-access` does the same on the server with a mandatory temporary password (all
   sessions die because they are bound to the password hash).
4. **Session revocation** on password change (others), MFA enrollment (others), access reset (all) and
   account disable (all). `POST /api/v1/staff-users/:id/disable` (SUPER_ADMIN, reason code, audited
   `USER_DISABLED`, refuses self and the last active SUPER_ADMIN) reuses `UsersService.disableUser` to
   retire demo accounts. The last-SUPER_ADMIN count and the status change run in one transaction under
   `pg_advisory_xact_lock`, so concurrent disables cannot remove the last one.
5. Roles and permissions are unchanged; student authentication is untouched (student routes skip the
   staff guard entirely).

## Migration and compatibility

`20261117090000_staff_mfa_first_login` is additive: `users.password_change_required boolean NOT NULL
DEFAULT false` (metadata-only on PostgreSQL ≥ 11), three nullable MFA columns, the
`staff_mfa_recovery_codes` table and CHECK constraints. **Existing users are not flagged** and have no
MFA; nothing changes for them until `STAFF_MFA_ENFORCED=true`. Release 70b11d2 keeps working against the
migrated schema: it never selects the new columns, its inserts get the defaults, and it rejects pending
MFA sessions (see 2). Rolling back to 70b11d2 after enrollment disables the second factor (that release
does not know about MFA) — roll back only in an emergency, and turn enforcement off first.

**Rollback rules (operators).**

- **`STAFF_MFA_ENFORCED` must stay `false`** until a rollback to 70b11d2 is no longer expected. Turning
  enforcement on while a rollback is still possible would make staff depend on a factor that the
  rolled-back release silently drops.
- **After any rollback to 70b11d2, every account with `password_change_required = true` must be reset or
  disabled.** 70b11d2 ignores the flag, so such an account signs in with the operator-issued
  first-login or temporary password as a full session. Before reopening the service, list them
  (`SELECT id, email FROM users WHERE password_change_required AND status = 'ACTIVE';`) and either
  give each a new password the account holder sets in person, or disable the account. The same
  applies when moving forward again: re-check the list.
- The new MFA lockout state lives only in Redis (`<prefix>mfa-lock:*`, `<prefix>mfa-failures:*`);
  70b11d2 ignores it, and no migration is involved.

## Consequences

- Production needs `STAFF_MFA_ENCRYPTION_KEY` (the API refuses to start without it). Losing or rotating
  the key makes enrolled authenticators and recovery codes unusable: staff then need an access reset.
  Key rotation with re-encryption is future work.
- Recovery-code regeneration and self-service MFA removal are not built; an access reset covers both.
- Synthetic test fixtures (`prepare-e2e.mjs`, `deploy/scripts/fixture.mjs`,
  `deploy/coexist/full_stack_fixture.mjs`) pass `requirePasswordChange: false` explicitly.
