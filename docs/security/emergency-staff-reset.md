# Emergency staff access reset security review

## Baseline inspection

Reviewed GitHub main at `93f2bd958da162cbf9a2a64e71914baef6647c6b`, including merged PR #61.

- `pnpm staff:reset-access` resolves a normalized, exact staff email. It writes the temporary password and first-login flag, clears MFA and recovery codes, and records a CLI audit event in one PostgreSQL transaction. It preserves account status and roles.
- Email recovery uses 32 random bytes. Redis holds the token digest and a user pointer with the configured TTL. Issuing a link replaces the prior pointer. Consumption is single-use, and password replacement already compares the hash read before the write.
- PR #61 added Redis revocation for the web disable, enable and access-reset actions. The direct database CLI does not call those actions. A link issued against the previous credential can therefore remain eligible after the emergency reset. Revoking the Redis pointer alone would leave a race with an already in-flight email request.
- Existing sessions already compare the live credential binding on every authenticated request. A separate session-store deletion is unnecessary for immediate access denial after the CLI commits.

## Fix and compatibility

- New links retain the existing single-use and expiry rules. Redis stores a keyed binding to the staff user's current credentials. The API checks the binding before consuming the token and compares the password hash and MFA state again at the database write.
- The emergency CLI commits the password change, MFA recovery-code deletion and audit together. Commit invalidates the old links and sessions. A rolled-back transaction leaves the original credentials and valid links intact. Concurrent CLI resets compare the account snapshot so only the first can replace a given credential.
- The CLI refuses a temporary password that matches the current one. Creating a new salted hash alone would invalidate sessions and links while leaving the old password usable.
- Staff in a temporary-password handover receive the same forgot-password response as an unknown account and receive no email. An MFA enrollment confirmation also compares the credentials it verified when it commits. With MFA enforced, the successful recovery path remains password change, then MFA enrollment, then staff access.
- The new Redis namespace fails closed for links issued before the upgrade. Staff with a pending legacy link must request a new one after the updated API is serving requests. The emergency CLI and the serving API must be on this release for the credential binding to apply. Before restoring an older API with email recovery enabled, wait for legacy links to expire or verify they have been revoked. The repository's default email notifier remains unconfigured.

## Separate audit findings

- The normal web access-reset flow reports an error if the post-commit Redis cleanup for MFA enrollment or lockout fails. At that point the password, reset audit and database changes have already committed. Re-enablement in PR #61 uses pre-commit MFA cleanup and does not have that failure order.
- Web access reset still accepts a policy-compliant temporary password that matches the current password. The emergency CLI still leaves transient MFA enrollment and lockout keys to the existing expiry and enrollment cleanup paths. The credential check prevents stale enrollment confirmation.
- Staff role checks remain on the server. The last-active-Super-Admin demotion and disable protections still use a shared transaction lock. Emergency reset does not write status or role assignments.
