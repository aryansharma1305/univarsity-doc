# Stage 1 changed-file inventory

Baseline: `d791afd7da3b0efc2db7965cc3a2fa6417a90d60`. All changes remain uncommitted.

No Prisma schema/migration, permissions constants, UI, deployment configuration, university grading/publication policy, signing or payment-provider implementation changed. Payment changes are tests for the shared upload inspector only.

| Repository-relative path                                          | Purpose                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/api/src/academic/registrations.service.ts`                  | Lock current record before partial update/audit snapshot.                                       |
| `apps/api/src/academic/students.service.ts`                       | Lock current record before partial update/audit snapshot.                                       |
| `apps/api/src/auth/auth.guard.ts`                                 | Authority/credential revalidation, stale-session denial and credential-race protection.         |
| `apps/api/src/auth/auth.service.ts`                               | Authority/credential revalidation, stale-session denial and credential-race protection.         |
| `apps/api/src/auth/password-reset.store.ts`                       | Atomic current-token replacement/consumption in Redis.                                          |
| `apps/api/src/auth/session.store.ts`                              | Credential-bound live sessions; atomic activity/rebinding with expiry preservation.             |
| `apps/api/src/historical-documents/document-file.ts`              | Reject unchecked object streams and recognize PDF NUL whitespace.                               |
| `apps/api/src/student-auth/student-auth.guard.ts`                 | Authority/credential revalidation, stale-session denial and credential-race protection.         |
| `apps/api/src/student-auth/student-auth.service.ts`               | Authority/credential revalidation, stale-session denial and credential-race protection.         |
| `apps/api/src/student-profile/profile-requests.service.ts`        | Revalidate proposed changes against fresh locked student state.                                 |
| `apps/api/src/users/users.service.ts`                             | Conditional active-user credential SQL replacement.                                             |
| `apps/api/test/academic/concurrent-records.test.ts`               | Synthetic security/reliability regression coverage; no real data.                               |
| `apps/api/test/auth/credential-races.test.ts`                     | Synthetic security/reliability regression coverage; no real data.                               |
| `apps/api/test/auth/reset-token-races.test.ts`                    | Synthetic security/reliability regression coverage; no real data.                               |
| `apps/api/test/examinations/re-exam-payments.test.ts`             | Synthetic security/reliability regression coverage; no real data.                               |
| `apps/api/test/historical-documents/document-file.test.ts`        | Synthetic security/reliability regression coverage; no real data.                               |
| `apps/api/test/historical-documents/historical-documents.test.ts` | Synthetic security/reliability regression coverage; no real data.                               |
| `apps/api/test/historical-documents/support.ts`                   | Synthetic security/reliability regression coverage; no real data.                               |
| `apps/api/test/student-auth/activation.test.ts`                   | Synthetic security/reliability regression coverage; no real data.                               |
| `apps/web/e2e/certificate-templates.spec.ts`                      | Distinguish iframe auto-downloads from named sample downloads; retain exact filename assertion. |
| `apps/web/e2e/marksheet-templates.spec.ts`                        | Distinguish iframe auto-downloads from named sample downloads; retain exact filename assertion. |
| `apps/web/e2e/historical-documents.spec.ts`                       | Wait for committed authenticity response and closed dialog before closing reviewer browser.     |
| `apps/web/e2e/student-profile.spec.ts`                            | Wait for committed rejection response and closed dialog; preserve all original assertions.      |
| `docs/development/phase-15a-quality-hardening.md`                 | Stage 1 evidence, review scope, compatibility and handover documentation.                       |
| `docs/final-handover/01-changed-files.md`                         | Stage 1 evidence, review scope, compatibility and handover documentation.                       |
| `docs/final-handover/01-independent-review.md`                    | Stage 1 evidence, review scope, compatibility and handover documentation.                       |
| `docs/final-handover/01-security-and-reliability-audit.md`        | Stage 1 evidence, review scope, compatibility and handover documentation.                       |
| `graphify-out/GRAPH_REPORT.md`                                    | Required generated navigation artifact; no runtime behavior.                                    |
| `graphify-out/graph.html`                                         | Required generated navigation artifact; no runtime behavior.                                    |
| `graphify-out/graph.json`                                         | Required generated navigation artifact; no runtime behavior.                                    |
| `packages/imports/package.json`                                   | Promote cached/locked SAX parser to direct dependency; no installation/download.                |
| `packages/imports/src/container.ts`                               | Bounded structural XML preflight before ExcelJS materialization; content-based classification.  |
| `packages/imports/src/workbook.ts`                                | Avoid allocating blank cells across sparse row gaps.                                            |
| `packages/imports/test/container.test.ts`                         | Synthetic security/reliability regression coverage; no real data.                               |
| `packages/imports/test/workbook.test.ts`                          | Synthetic security/reliability regression coverage; no real data.                               |
| `pnpm-lock.yaml`                                                  | Three-line direct-dependency importer entry; existing saxes 6.0.0 resolution retained.          |

The original Phase15A worktree remains intact; Stage0 audit files are preserved in the separate final-closure worktree. New release features are excluded.
