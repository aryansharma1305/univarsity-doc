# ADR-0010: Students are a separate principal, activated with university-issued codes

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

The university wants a student portal (requirements C1–C3). Students exist as imported registrations
(Phase 5), often without email, phone or date of birth. Registration numbers are printed on many
documents, so they are not a secret. Staff authentication (ADR-0007) must not be weakened, and no student
may ever obtain a staff capability.

## Decision

1. **Separate principal.** `student_accounts` (one per student) — never rows in `users`, never roles or
   permissions. Separate endpoints (`/student-auth/*`, `/student/*`), cookie (`dv_student`), Redis
   namespace (`StudentSessionStore`) and guard (`StudentAuthGuard`, only on `@StudentRoute()` routes).
   The same hardened session, CSRF, rate-limit and Argon2id mechanisms are reused, not reimplemented.
2. **Ownership proof = single-use activation code** issued by staff per registration (registration
   number + code + new password). Codes are random, short-lived, stored only as keyed hashes, revoked
   after repeated wrong guesses, and answer every failure identically.
3. **Recovery uses the same proof:** a new code resets the password of an existing account.
4. **Ownership is derived from the session** on every student request; student endpoints take no
   student or registration identifiers.

## Consequences

- Codes must be delivered out of band (printed letters, the university's own channels). Verified
  email/phone methods can be added later as additional activation methods.
- Staff can see whether a registration has an account, an open code or neither, but can never see a
  code again after issuing it.
- Phase 7 (profile change requests) and later portal features build on `StudentRoute` + the session's
  `studentId`.
