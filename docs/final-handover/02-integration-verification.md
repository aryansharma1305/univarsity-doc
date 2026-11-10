# Release-candidate integration verification

10 November 2026. Base: `d791afd7da3b0efc2db7965cc3a2fa6417a90d60`.
Branch: `integration/pre-vps-release-candidate`. **Local verification checkpoint; not deployed.**
Final release delivery was approved on 10 November 2026. Exact candidate SHA, CI and image evidence
will be recorded on the release PR. The local checkpoint below precedes that delivery.
The accepted Stage 0 audit and original dirty worktrees remain intact. This is executed integration
evidence and release notes, not a replacement audit or another planning phase.

## Integrated implementation

| Area                 | Candidate behavior                                                                                                                                                       | Authority boundary                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Phase 15A            | Credential-bound sessions, activation/reset concurrency corrections, live Redis session CAS, locked academic/profile writes, bounded spreadsheets, static PDF inspection | Existing unbound sessions must re-login; original academic/RBAC/CSRF controls retained                 |
| Grading              | Server-owned marks/curriculum evaluation during SUBMIT; calculation, review snapshot and audit commit atomically                                                         | Explicit synthetic test policy only; official GPA/outcome/publication remain disabled                  |
| Student result reads | Bounded, registration-owned published sample reads with approval/SUBMIT provenance and source digests; sample cards in existing UI                                       | Original Result remains APPROVED and unpublished; no official marksheet                                |
| Certificates         | Request-backed preparation, maker/checker, number allocation, private unsigned SAMPLE PDF, supersession/revocation and owned preview                                     | Default/production unavailable; illustrative pinned content, no real signing, Rector or QR activation  |
| Verification         | Four staff-only synthetic status adapters and owned admission linkage                                                                                                    | Official public endpoints unchanged, constant UNAVAILABLE; adapters return no personal academic fields |
| Retotaling           | Owned submission, information request/response, cancellation, closure, versioned history and atomic audit                                                                | Clerical only; no invented fee, academic decision or marks mutation                                    |
| Generic migration    | Bounded synthetic dry-run, normalization, deduplication/conflicts, quarantine, dependency checks, reconciliation and resumable immutable plans                           | No academic import/account activation/publication port; real export mapping not fabricated             |
| Sandbox payments     | Durable DB orders/receipts, signed mock callbacks, atomic existing payment submission, restart reconciliation and serialized idempotent refunds                          | SUBMITTED only, never financial verification or academic approval; no real merchant/bank calls         |
| Hostinger            | Existing Compose/Caddy, separate runtime templates, clean-SHA/Ubuntu preflight, private networking and conservative backup refusal gate                                  | No alternative host, remote deployment, DNS or ACME action                                             |

API contracts, data provenance, new endpoints and additive migration impact are described in
[synthetic release workflows](../api/release-workflows.md). Existing certificate rendering/eligibility
and historical document behavior are preserved. The original 20 migrations are unchanged; migration
21 adds six tables and integrity guards without rewriting existing rows. Only isolated fixtures have
received it.

## Executed verification

| Scope                                    | Actual evidence                                                                                                                                                                          | Exit |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: |
| Earlier focused Phase 15A                | 952 unit/integration tests and 78/78 browsers; scoped independent source reviews                                                                                                         |    0 |
| Earlier grading/payment checkpoint       | 1,020 unit/integration tests and 78/78 browsers; all repository gates                                                                                                                    |    0 |
| New workflow target run 7                | 54 API, 21 permissions, 95 validation, 107 import and 3 student-results UI tests                                                                                                         |    0 |
| Same target run                          | Format; affected package/API/web lint/typecheck; dependency/API builds; 21 migrations applied and zero Prisma drift                                                                      |    0 |
| Service launcher additions               | Two real-process runtime injection/refusal regressions passed in the combined run                                                                                                        |    0 |
| Complete combined repository/browser run | 1,052 tests / 130 files; 78 browser tests; 0 failed/skipped/not run; all workspace gates                                                                                                 |    0 |
| Native synthetic DB/object recovery      | 46 application-table fingerprints equal; functions/triggers and constraint identities/flags retained; valid/invalid CHECK controls; restricted-role reads; private MinIO byte round-trip |    0 |
| Existing CI upgrade script               | Synthetic populated Phase 7 data upgraded through all 21 migrations; original identity/registration/result rows preserved and historical guards enforced                                 |    0 |
| Compose/Caddy checkpoint                 | Six base/review/public configuration parses including operator profiles; two isolated Caddy adaptations                                                                                  |    0 |
| Graphify                                 | 8,021 nodes, 19,061 edges, 980 communities; three required generated artifacts refreshed                                                                                                 |    0 |

Earlier totals overlap and must not be summed. The old 1,020/78 checkpoint predates the later
certificate and workflow additions. `release-full-2` passed as the final combined run. Target checks use
actual package scripts and cached dependencies inside disposable Linux namespaces. They do not
certify a fresh frozen-lock install or new production container images. Browser tracing alone is
disabled externally; assertions, security checks, deadlines and screenshot requirements are intact.

The new workflow sequence initially stopped on lint diagnostics, which were corrected without
relaxing rules. Its first functional run passed 51/52 API cases; migration dry-run returned 500 because
its void-returning advisory lock used `$queryRaw`. The corrected path uses the existing `$executeRaw`
pattern; run 7 passed dry-run, changed replay refusal, audit rollback, recovery and stable retry.
All original failures are retained externally. No safety assertion was removed or test skipped.

Target run 7 also exercises published-only ownership/denial, unpublished source preservation,
maker/checker rules, immutable snapshots, withdrawn adapters, private admission ownership, concurrent
retotaling duplicate/cancellation rollback, certificate revocation, signed callback audit rollback,
service-restart receipts and concurrent refund balances. All real verification services still return
UNAVAILABLE after synthetic successes.

External evidence root: `~/security-audit-skill/univarsity-doc/phase15a-closure/`.
Relevant files are `agents/workflow-runtime/artifacts/workflow-target-7.log`,
`agents/release-full-runtime/artifacts/release-full-2.log`,
`release-full-2-source-sha256.json`, `release-full-2-telemetry.json`, `release-full-2-evidence-summary.json`, and
`agents/recovery-runtime/artifacts/native-recovery-3.json`.
The focused [independent-review report](01-independent-review.md) and
[36-path security inventory](01-changed-files.md) describe the separate security branch, not the
whole candidate. The candidate's 13 security production paths match the reviewed security branch byte-for-byte. Later workflow additions are not covered by those independent source reviews.
Graphify is navigation only: 23 SQL files lack the optional parser, and two TypeScript barrels may
be partially extracted; no dependency was installed to change that.

Latest fetched main remains unchanged. Both jobs in
[main CI run 39873876235](https://github.com/aryansharma1305/univarsity-doc/actions/runs/39873876235)
are successful. They cover main, **not this uncommitted candidate**. There is no candidate commit SHA,
image digest set or candidate CI result yet.

## Full-run resources and recovery diagnostics

Full wrapper elapsed **864.087 seconds**; browser duration **8.9 minutes**. All child quality gates,
the browser process, migration SQL and supervisor exited 0. Across 43 samples, peak tool memory was
**2,246.656 MiB**, CPU **195.12%** within a two-CPU quota, and PIDs **167/256**; minimum host free disk
was **7.137 GiB**. The Mac remained on AC at 100%, with no reported thermal warning or safety stop.
The lid was confirmed open. These are sampled local measurements, not Hostinger capacity tests.

The native recovery rehearsal completed in **9.421 seconds**, using fresh tmpfs PostgreSQL and two
separate MinIO instances with no host ports or durable volumes. Its first two runs stopped on a raw
CHECK-definition text comparison: PostgreSQL reparsed equivalent array casts during pg_restore.
The final check compares all constraint names/types/validation/deferral/action flags and exercises
valid/invalid copied CHECK rows on both databases, in addition to exact function/trigger definitions
and table data fingerprints. No application constraint or functional assertion was weakened. The
restored restricted role can read the fixture and cannot create schema objects. Both buckets remain
private and the mirrored object bytes match SHA-256
`abd3becd128a831d7095988a691f5e6e8523fb478a19477d3399143dae8dc70d`.
Migration metadata was checked separately by the full Prisma run: 21 applied, zero unfinished.
The recovery fixture does not stand in for actual staging.py startup, queue drain, image rollback,
off-host backup or production disaster recovery.

## Completion and blocker matrix

| Milestone                      | Verified completion                                                                             | Remaining acceptance blockers                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| University demo ready          | Existing student/staff interfaces plus targeted synthetic workflow/API success and denial tests | Review and delivery of focused security/integration changes; production-mode image/startup/gate acceptance on the candidate                                                          |
| Pre-VPS engineering complete   | Implemented workflow foundations, additive migration, existing Hostinger configuration/runbook  | Candidate-SHA CI; fresh image builds and immutable identities; launcher/config runtime, synthetic staging backup/restore/rollback and monitoring acceptance; reviewed changes merged |
| Hostinger deployment           | Configuration and operator command references prepared locally                                  | VPS/access, reviewed immutable release, domain/DNS/ACME authorization and host acceptance; off-host backup/key custody, RPO/RTO and monitoring ownership                             |
| Official university operations | Safe refusal paths remain intact                                                                | University grading/publication/fees/payment merchant/signing/numbering/revocation/privacy authority and real migration exports/authorization                                         |

The conservative queue backup gate refuses pending/active/delayed/repeating/failed/paused jobs and
unfinished imports after a clean worker shutdown. It does not constitute production BullMQ drain,
Redis recovery or disaster-recovery certification. No job is deleted to obtain a passing backup.
The [Hostinger runbook](../development/hostinger-operator-runbook.md) retains this limitation.
The native recovery rehearsal validates the dump/restore and private mirror primitives, not the staging launcher, full-stack rollback or production disaster recovery. The local cached Linux images do not provide Python; launcher runtime tests therefore remain
unexecuted locally. Their AST validation is not a test pass. No dependency download/image rebuild or
hosting experiment was substituted. Fresh production builds/recovery must be evidenced separately.

Real payment collection/refunds, official result publication, issuance/signing, admission decisions,
public verification and historical imports remain unauthorized. These external policy requirements
do not justify presenting synthetic success paths as production-authorized workflows.

## Preservation and delivery

All fixtures use isolated PostgreSQL databases, Redis namespaces and MinIO instances/buckets with
synthetic credentials, no published host ports and no external interface. Target source/toolchain are
read-only; disposable writes are confined to bounded tmpfs. The full run is supervised for host power,
thermal warnings, free disk and container resources, with an idle-sleep inhibitor. It cannot prevent
lid-close sleep. Original containers, volumes, worktrees, credentials and backups are not test inputs.

Final preservation comparison matches 21 original containers, 41 original volumes and 21 original dirty files. Historical migrations are unchanged. Docker mount arrays vary in order; comparisons sort complete mount dictionaries by destination without ignoring any mount field. Initial raw-order mismatches were comparison artifacts, not resource changes. The 13 focused security production paths are byte-identical to the reviewed security branch. The final inventory contains 103 changed paths, including required generated graphs and this report.
Preservation evidence checks containment, original container metadata/volume presence and original
dirty-file SHA-256 values; it does not claim unperformed checksums of real university database rows or
MinIO objects. No original data-content query is required or performed.

At the local verification checkpoint no commit, push, PR, merge or external deployment had been
performed. Delivery is now approved for the existing candidate branch and isolated CI rehearsal.
The release must stop at final merge approval; no automatic merge or external deployment is authorized.
Base CI and cached image IDs cannot substitute for candidate-SHA CI and fresh image evidence.

## Changed-file inventory

103 paths against the base, including untracked additions. Scope totals: API 43, web 6, worker 3,
packages 30, deployment 7, documentation 10, required Graphify artifacts 3, and root lockfile 1.
This combined inventory includes the security subset; it does not replace its focused review.
The external `release-candidate-final-inventory.json` records each path's SHA-256 and byte size.

| Repository-relative path                                                                       | Scope                                                |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `apps/api/package.json`                                                                        | Application/package integration                      |
| `apps/api/src/academic/registrations.service.ts`                                               | Application/package integration                      |
| `apps/api/src/academic/students.service.ts`                                                    | Application/package integration                      |
| `apps/api/src/app.module.ts`                                                                   | Application/package integration                      |
| `apps/api/src/auth/auth.guard.ts`                                                              | Application/package integration                      |
| `apps/api/src/auth/auth.service.ts`                                                            | Application/package integration                      |
| `apps/api/src/auth/password-reset.store.ts`                                                    | Application/package integration                      |
| `apps/api/src/auth/session.store.ts`                                                           | Application/package integration                      |
| `apps/api/src/certificate-requests/synthetic-certificates.controller.ts`                       | Application/package integration                      |
| `apps/api/src/certificate-requests/synthetic-certificates.module.ts`                           | Application/package integration                      |
| `apps/api/src/certificate-requests/synthetic-certificates.service.ts`                          | Application/package integration                      |
| `apps/api/src/historical-documents/document-file.ts`                                           | Application/package integration                      |
| `apps/api/src/re-exams/re-exam-payments.service.ts`                                            | Application/package integration                      |
| `apps/api/src/re-exams/re-exams.module.ts`                                                     | Application/package integration                      |
| `apps/api/src/release-workflows/legacy-migration.service.ts`                                   | Application/package integration                      |
| `apps/api/src/release-workflows/release-workflows.module.ts`                                   | Application/package integration                      |
| `apps/api/src/release-workflows/releases.service.ts`                                           | Application/package integration                      |
| `apps/api/src/release-workflows/retotaling.service.ts`                                         | Application/package integration                      |
| `apps/api/src/release-workflows/sandbox-gateway.service.ts`                                    | Application/package integration                      |
| `apps/api/src/release-workflows/verification-adapters.service.ts`                              | Application/package integration                      |
| `apps/api/src/release-workflows/workflow-policy.service.ts`                                    | Application/package integration                      |
| `apps/api/src/release-workflows/workflows.controller.ts`                                       | Application/package integration                      |
| `apps/api/src/results/result-review.service.ts`                                                | Application/package integration                      |
| `apps/api/src/student-auth/student-auth.guard.ts`                                              | Application/package integration                      |
| `apps/api/src/student-auth/student-auth.service.ts`                                            | Application/package integration                      |
| `apps/api/src/student-profile/profile-requests.service.ts`                                     | Application/package integration                      |
| `apps/api/src/student-results/student-results.controller.ts`                                   | Application/package integration                      |
| `apps/api/src/student-results/student-results.module.ts`                                       | Application/package integration                      |
| `apps/api/src/users/users.service.ts`                                                          | Application/package integration                      |
| `apps/api/test/academic/concurrent-records.test.ts`                                            | Synthetic regression or browser coverage             |
| `apps/api/test/auth/credential-races.test.ts`                                                  | Synthetic regression or browser coverage             |
| `apps/api/test/auth/reset-token-races.test.ts`                                                 | Synthetic regression or browser coverage             |
| `apps/api/test/certificate-requests/synthetic-lifecycle.test.ts`                               | Synthetic regression or browser coverage             |
| `apps/api/test/deploy-preflight.test.ts`                                                       | Synthetic regression or browser coverage             |
| `apps/api/test/examinations/re-exam-payments.test.ts`                                          | Synthetic regression or browser coverage             |
| `apps/api/test/historical-documents/document-file.test.ts`                                     | Synthetic regression or browser coverage             |
| `apps/api/test/historical-documents/historical-documents.test.ts`                              | Synthetic regression or browser coverage             |
| `apps/api/test/historical-documents/support.ts`                                                | Synthetic regression or browser coverage             |
| `apps/api/test/release-workflows/workflows.test.ts`                                            | Synthetic regression or browser coverage             |
| `apps/api/test/result-imports/support.ts`                                                      | Synthetic regression or browser coverage             |
| `apps/api/test/results/result-review.test.ts`                                                  | Synthetic regression or browser coverage             |
| `apps/api/test/runtime-templates.test.ts`                                                      | Synthetic regression or browser coverage             |
| `apps/api/test/student-auth/activation.test.ts`                                                | Synthetic regression or browser coverage             |
| `apps/web/e2e/certificate-templates.spec.ts`                                                   | Synthetic regression or browser coverage             |
| `apps/web/e2e/historical-documents.spec.ts`                                                    | Synthetic regression or browser coverage             |
| `apps/web/e2e/marksheet-templates.spec.ts`                                                     | Synthetic regression or browser coverage             |
| `apps/web/e2e/student-profile.spec.ts`                                                         | Synthetic regression or browser coverage             |
| `apps/web/src/features/student-portal/student-results.tsx`                                     | Application/package integration                      |
| `apps/web/test/student-results.test.tsx`                                                       | Synthetic regression or browser coverage             |
| `apps/worker/src/backup-readiness.ts`                                                          | Application/package integration                      |
| `apps/worker/src/scripts/backup-readiness.ts`                                                  | Application/package integration                      |
| `apps/worker/test/backup-readiness.test.ts`                                                    | Synthetic regression or browser coverage             |
| `deploy/compose.yml`                                                                           | Existing deployment architecture and safety controls |
| `deploy/env/api.env.example`                                                                   | Existing deployment architecture and safety controls |
| `deploy/env/web.env.example`                                                                   | Existing deployment architecture and safety controls |
| `deploy/env/worker.env.example`                                                                | Existing deployment architecture and safety controls |
| `deploy/scripts/staging.py`                                                                    | Existing deployment architecture and safety controls |
| `deploy/scripts/test_staging.py`                                                               | Existing deployment architecture and safety controls |
| `deploy/scripts/vps-preflight.sh`                                                              | Existing deployment architecture and safety controls |
| `docs/api/grading-foundation.md`                                                               | Evidence or operator/API documentation               |
| `docs/api/release-workflows.md`                                                                | Evidence or operator/API documentation               |
| `docs/api/synthetic-certificate-lifecycle.md`                                                  | Evidence or operator/API documentation               |
| `docs/development/hostinger-operator-runbook.md`                                               | Evidence or operator/API documentation               |
| `docs/development/phase-14a-deployment-readiness.md`                                           | Evidence or operator/API documentation               |
| `docs/development/phase-15a-quality-hardening.md`                                              | Evidence or operator/API documentation               |
| `docs/final-handover/01-changed-files.md`                                                      | Evidence or operator/API documentation               |
| `docs/final-handover/01-independent-review.md`                                                 | Evidence or operator/API documentation               |
| `docs/final-handover/01-security-and-reliability-audit.md`                                     | Evidence or operator/API documentation               |
| `docs/final-handover/02-integration-verification.md`                                           | Evidence or operator/API documentation               |
| `graphify-out/GRAPH_REPORT.md`                                                                 | Required generated navigation artifact               |
| `graphify-out/graph.html`                                                                      | Required generated navigation artifact               |
| `graphify-out/graph.json`                                                                      | Required generated navigation artifact               |
| `packages/database/prisma/migrations/20261110090000_synthetic_release_workflows/migration.sql` | New additive migration; no historical rewrite        |
| `packages/database/prisma/schema.prisma`                                                       | Application/package integration                      |
| `packages/imports/package.json`                                                                | Application/package integration                      |
| `packages/imports/src/container.ts`                                                            | Application/package integration                      |
| `packages/imports/src/index.ts`                                                                | Application/package integration                      |
| `packages/imports/src/legacy-dry-run.ts`                                                       | Application/package integration                      |
| `packages/imports/src/workbook.ts`                                                             | Application/package integration                      |
| `packages/imports/test/container.test.ts`                                                      | Synthetic regression or browser coverage             |
| `packages/imports/test/legacy-dry-run.test.ts`                                                 | Synthetic regression or browser coverage             |
| `packages/imports/test/workbook.test.ts`                                                       | Synthetic regression or browser coverage             |
| `packages/payments/README.md`                                                                  | Application/package integration                      |
| `packages/payments/eslint.config.js`                                                           | Application/package integration                      |
| `packages/payments/package.json`                                                               | Application/package integration                      |
| `packages/payments/src/index.ts`                                                               | Application/package integration                      |
| `packages/payments/test/mock-provider.test.ts`                                                 | Synthetic regression or browser coverage             |
| `packages/payments/tsconfig.build.json`                                                        | Application/package integration                      |
| `packages/payments/tsconfig.json`                                                              | Application/package integration                      |
| `packages/payments/vitest.config.ts`                                                           | Application/package integration                      |
| `packages/storage/src/keys.ts`                                                                 | Application/package integration                      |
| `packages/storage/test/keys.test.ts`                                                           | Synthetic regression or browser coverage             |
| `packages/types/src/audit.ts`                                                                  | Application/package integration                      |
| `packages/types/src/permissions.ts`                                                            | Application/package integration                      |
| `packages/validation/src/canonical-json.ts`                                                    | Application/package integration                      |
| `packages/validation/src/certificate-requests/synthetic-lifecycle.ts`                          | Application/package integration                      |
| `packages/validation/src/index.ts`                                                             | Application/package integration                      |
| `packages/validation/src/release-workflows.ts`                                                 | Application/package integration                      |
| `packages/validation/src/results/grading.ts`                                                   | Application/package integration                      |
| `packages/validation/src/results/student-results.ts`                                           | Application/package integration                      |
| `packages/validation/test/canonical-json.test.ts`                                              | Synthetic regression or browser coverage             |
| `packages/validation/test/grading.test.ts`                                                     | Synthetic regression or browser coverage             |
| `pnpm-lock.yaml`                                                                               | Application/package integration                      |
