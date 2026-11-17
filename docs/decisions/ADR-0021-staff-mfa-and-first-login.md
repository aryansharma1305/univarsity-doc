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
     SVG QR code) and keeps it encrypted in Redis for 10 minutes; it becomes active only after a valid
     code (`POST /auth/mfa/enrollment/confirm`).
   - **At rest:** AES-256-GCM, key derived by HKDF from `STAFF_MFA_ENCRYPTION_KEY` (64 hex chars), the
     user ID as associated data (a ciphertext copied to another row does not decrypt).
   - **Login is two steps.** A correct password for an MFA account creates a _pending_ session
     (`stage: 'mfa'`, 5-minute absolute lifetime) that can only call `POST /auth/mfa/verify`. Success
     replaces it with a **new** session ID (fixation defence). Pending sessions use a separate
     credential-binding HMAC domain, so any reader that ignores `stage` — including release 70b11d2 on
     the same Redis — rejects them instead of treating them as full sessions.
   - **Replay protection:** `users.mfa_totp_last_used_step` is advanced with a compare-and-set; a step
     at or below it is never accepted (each code works once, and older codes stop working).
   - **Rate limiting:** the sign-in limits (`LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP`/`_PER_ACCOUNT`/`_PER_IP`
     per `LOGIN_RATE_LIMIT_WINDOW_SECONDS`) in an own `mfa` scope, checked before any code is compared;
     the first throttled attempt per window is audited.
   - **Enforcement:** `STAFF_MFA_ENFORCED=true` makes every staff account without MFA enroll before
     anything else (step `MFA_ENROLL`). Default `false`.
3. **Recovery.** Ten single-use recovery codes (50 bits each, `XXXXX-XXXXX`) are issued at enrollment
   and shown once; only `HMAC-SHA256(HKDF(key, "recovery-code"), userId‖code)` is stored
   (`staff_mfa_recovery_codes`), spent by a compare-and-set on `used_at`. A SUPER_ADMIN (`users.manage`)
   can reset another member's access (`POST /api/v1/staff-users/:id/access-reset`: removes MFA and
   recovery codes, sets the password-change flag, optional temporary password, revokes all sessions;
   audited `STAFF_ACCESS_RESET`). When no administrator can sign in, the operator CLI
   `pnpm staff:reset-access` does the same on the server with a mandatory temporary password (all
   sessions die because they are bound to the password hash).
4. **Session revocation** on password change (others), MFA enrollment (others), access reset (all) and
   account disable (all). `POST /api/v1/staff-users/:id/disable` (SUPER_ADMIN, reason code, audited
   `USER_DISABLED`, refuses self and the last active SUPER_ADMIN) reuses `UsersService.disableUser` to
   retire demo accounts.
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

## Consequences

- Production needs `STAFF_MFA_ENCRYPTION_KEY` (the API refuses to start without it). Losing or rotating
  the key makes enrolled authenticators and recovery codes unusable: staff then need an access reset.
  Key rotation with re-encryption is future work.
- Recovery-code regeneration and self-service MFA removal are not built; an access reset covers both.
- Synthetic test fixtures (`prepare-e2e.mjs`, `deploy/scripts/fixture.mjs`,
  `deploy/coexist/full_stack_fixture.mjs`) pass `requirePasswordChange: false` explicitly.
