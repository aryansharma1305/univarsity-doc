# CI recovery: preview expiry during a draft import

Base: main `dd0de3d99393f980253db9f2d747a4c69a433a7a`.
Failed run: https://github.com/aryansharma1305/univarsity-doc/actions/runs/38095659463.

## Failure and diagnosis

The assertion at `apps/api/test/results/draft-results.test.ts:461` expected HTTP 409 but received 404
in “rolls back if the preview expires during a commit.” This is different from the earlier UI-02 CI
failure in the injected audit-failure test (expected 500, received 409).

The old preview mock returned null on its third metadata read. A normal commit reads metadata at
entry, plan preparation, then final validation. The service legitimately retries a serializable
transaction after Prisma P2034. A retry consumes the mock's same process-wide counter and encounters
null at entry/preparation, returning 404 before the intended post-write expiry check. Real preview
lifetime is not the mock's read count. The CI log does not expose the original transaction error;
shared-database serialization contention is the inferred trigger, while the retry-sensitive mock
defect is established by a deterministic isolated reproduction.

The original isolated test passed (3.6 seconds). Adding a single injected P2034 after an actual audit
write reproduced the exact expected-409/actual-404 failure (3.1 seconds), without competing test files
or real-time expiry. Therefore this failure is a test scenario placement defect exposed by retries,
not evidence of a transaction-integrity regression. An unmodified full-repository four-worker stress
run did not reproduce the target assertion; it hit a separate result-review fixture 500 instead.
That separate failure is recorded, not treated as the target reproduction.

## Smallest correction

Only the test changes. Expiry is activated after the awaited in-transaction audit write succeeds,
so a serialization retry cannot prematurely expire the next attempt's initial reads. The test runs
both with and without one injected serialization retry after real writes. The injected retry uses
the production retry path, actual Prisma transactions and the real database audit operation.

The HTTP 409 and zero-result assertions are preserved. Additional assertions require the expiry
boundary to be reached and require zero persisted subject marks, batch receipts and batch audit
entries. No production service, transaction policy, grading/publication rule or migration changes.

## Data preservation

Tests use only disposable `docversity_ci_recovery_*` databases. The separate isolated base database
receives existing migrations for drift verification. The original development database is never
reset, migrated, reseeded or used for synthetic writes. A private read-only baseline hashes all 38
existing public tables and records the key/ETag/size of all 1,924 pre-existing MinIO objects; these
were checked again after verification and match the baseline exactly. No MinIO bucket cleanup or original-object deletion is used.
Private logs, environment values and preservation manifests stay outside Git.

## Verification

- Five repeated isolated runs: both normal and forced-retry expiry cases pass each time.
- Three repeated full draft-results-file runs: all 21 tests pass each time.
- Two repeated full API runs: all 325 tests passed each time.
- Full format check and uncached lint/typecheck: passed.
- Full uncached repository unit/integration suite: all 676 tests passed.
- Uncached production build: all 10 tasks passed after setting aside failed generated `.next`
  output. Two earlier attempts failed inside Turbopack's Google-font import resolution; a clean
  build succeeded without source, dependency or configuration changes.
- Database drift check: "No difference detected."
- Complete Chromium browser suite: all 48 tests passed (5.7 minutes), including public pages,
  student portal, authentication, role permissions, academic workflows, Phase 10D review and
  publication, responsive navigation, keyboard access, mobile drawer and reduced motion.
- Preservation comparison: all 38 original table counts/content hashes and all 1,924 original
  MinIO object keys/ETags/sizes match the baseline exactly.
