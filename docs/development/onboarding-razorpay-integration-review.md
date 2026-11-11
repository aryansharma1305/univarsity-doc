# Clean university onboarding and Razorpay integration review

## PR summary

Review the two feature commits together against main
`e1ad1c30c84cc1941602bb013e49f61869aa7eb4`.

| Scope                                       | Preserved branch                       | Commit                                     |
| ------------------------------------------- | -------------------------------------- | ------------------------------------------ |
| Clean university onboarding                 | `feature/clean-university-onboarding`  | `8e28b34ba2d2f3d4b2d03ee97d44158b332e6121` |
| Razorpay payment buttons and reconciliation | `feature/razorpay-payment-integration` | `63245ee37e138d825c4e938c640910f924199266` |

The branches are joined on `integration/university-onboarding-razorpay`. The only merge conflicts
were `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.html` and `graphify-out/graph.json`. The
graph was regenerated from the combined source with `graphify update .`. Application code and
migrations merged without conflicts. Each feature remains reviewable in its original commit.

## Integration boundaries

- Clean onboarding provisions a separate environment and creates the first Super Admin explicitly.
  The registration workbook privacy check runs before an upload, queue job or audit write. Payment
  raw-body parsing is scoped to the Razorpay webhook route. Existing workbook upload and session
  handling work with both features present.
- The Razorpay migration adds two evidence tables. The empty-database guard checks them along with
  the rest of the application schema. An isolated database passed the guard before and after
  explicit synthetic Super Admin creation.
- Registration import and activation do not create fee obligations or enable checkout. Real provider
  and QR paths remain disabled. Existing authorized re-exam payment review remains intact. Only
  test-mode fixtures exercise signed Razorpay evidence and its manual reconciliation.
- Digital certificates are free. Digital and SAMPLE previews and downloads carry no checkout. The
  certificate button ID `pl_TyWXU0D8UbPlEC` maps only to hard copies. The hard-copy panel displays
  Unavailable and never loads the provider script because the delivery and fee contract is pending.
- A static Payment Button does not supply a trusted binding to a student's Docversity request.
  Captured evidence remains unattributed until authorized staff reconcile it with provider records.
  Automatic attribution requires a separately reviewed per-obligation Orders API integration.

## Validation

Testing used a new loopback-only Compose project, `dvint20261111`, with separate PostgreSQL, Redis
and private MinIO services and credentials. Unit, integration and browser data was synthetic.
Existing local container IDs (21/21), runtime state, port bindings and mounts matched the baseline.
All 41 previously recorded named volumes remained present. The preserved Hostinger release was
outside the test environment. No real records were uploaded or imported.

| Check                           | Command                                                                 | Result                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Format                          | `pnpm format:check`                                                     | Exit 0                                                                                                                                      |
| Lint                            | `pnpm lint`                                                             | Exit 0                                                                                                                                      |
| TypeScript                      | `pnpm typecheck`                                                        | Exit 0                                                                                                                                      |
| Fresh schema                    | `pnpm db:deploy`                                                        | Exit 0. All 22 migrations applied                                                                                                           |
| Schema drift                    | `pnpm db:check`                                                         | Exit 0                                                                                                                                      |
| Uncached build                  | `pnpm build --force`                                                    | Exit 0                                                                                                                                      |
| Uncached unit/integration       | `pnpm test --force`                                                     | Exit 0. 1,092 tests in 134 files                                                                                                            |
| Offline production Compose plan | `clean.py prepare` and `docker compose config --quiet`                  | Exit 0. Loopback-only Caddy, internal backend and no external volumes. The preserved image manifest was used to validate configuration only |
| Clean deployment tooling        | `python3 -m unittest discover -s deploy/university -p 'test_*.py'`      | Exit 0. 7 tests                                                                                                                             |
| Clean bootstrap                 | `check-empty.mjs`, Super Admin CLI, `check-empty.mjs --after-bootstrap` | Exit 0. One synthetic Super Admin and no academic, application or payment records                                                           |
| Browser                         | `pnpm --filter @docversity/web exec playwright test --trace off`        | Exit 0. 79 passed, 0 failed, 0 skipped in 611.87 seconds                                                                                    |

The synthetic import checks cover refusal of an ID-bearing workbook, preview and accepted import
after removing IDs. Payment tests cover ownership, signed and invalid evidence, manual staff
authorization, CSRF, retries and duplicate attribution. Browser coverage checks the hard-copy
label, disabled checkout, absence of Razorpay requests, keyboard focus and accessibility at
1440px, 768px and 390px.

## Private Registration 2025 copy

The original checksum matched before and after copy creation. The new workbook retains all 58
registration rows and every remaining cell value. The national-ID column was removed and the file
was checked for residual removed ID values. ExcelJS reopened the output and matched all 13 retained
columns against the source. It still contains private student data and must stay outside Git,
review attachments and test storage. The 58 rows are a source inventory, with import actions to be
determined in a future authorized preview.

Active → ACTIVE is confirmed. Academic session 2025 and Inactive → SUSPENDED remain provisional
pending university approval. Keep inactive registrations and their original statuses intact until
the university confirms the mapping. Approved course and school targets and cross-registration
person linkage are also needed.

## Production readiness and operator checklist

- [ ] **Review and release.** Review both commits and the combined diff. Require green CI on the
      exact approved source and a complete immutable image archive with checksums. Match the clean
      checkout, image-source SHA and loaded image IDs with `validate-release`. Preserve the currently
      verified reviewer release and recovery material.
- [ ] **Isolation and security.** Approve the target Hostinger instance, domain/TLS and operating
      owners. Provision a separate project, credentials and volumes. Validate private PostgreSQL,
      Redis and MinIO, a correctly configured trusted proxy, secure cookies, CORS/CSRF, reviewer
      protection where applicable, and student/staff ownership and roles. Keep official publishing,
      verification, signing and live payments disabled. The current checkout gate is test-only and
      requires a separately reviewed activation change.
- [ ] **Backups and recovery.** Assign backup ownership, retention, RPO and RTO. Prepare encrypted
      off-host PostgreSQL and private-object backups with checksums and restricted keys. Rehearse an
      isolated restore of both, including object/database reconciliation, before accepting real writes.
      Confirm the worker drain and Redis job recovery procedure with operations.
- [ ] **Student activation.** Approve the session code/dates, inactive mapping, program and
      department targets, and identity linkage. Create only approved master data. Run a registrar
      preview with the private copy, reconcile every row including conflicts and inactive rows, and
      obtain explicit commit approval. After verified import, distribute expiring single-use activation
      codes through an approved private channel. Assign least-privilege staff and handle missing DOB
      and photos through existing reviewed correction flows.
- [ ] **Payment merchant validation.** Confirm Docversity India merchant ownership and the actual
      receiving account. Verify dashboard mode, IDs, amounts, currency and service for each button.
      Approve exam/re-exam obligations and hard-copy delivery and fee rules. Use separate authorized
      sandbox credentials to test callbacks and replay. Establish restricted finance reconciliation
      using current provider records and a refunds/disputes procedure. Keep QR off until the receiving
      account and fallback are authorized. Keep digital certificates free.
- [ ] **Cutover and rollback.** Verify health, authenticated student/staff smoke tests and disabled
      gates on the intended release. Keep the prior reviewed compatible image set and a fresh verified
      pre-change backup. Stop writes if migration, health or reconciliation fails. Use the approved
      compatible rollback against the same data or a rehearsed recovery. Keep new university writes
      out of the reviewer environment and retain both sets of volumes.

See the [clean university onboarding runbook](clean-university-onboarding.md), the
[Razorpay security and activation notes](razorpay-payment-integration.md), and the
[Hostinger operator runbook](hostinger-operator-runbook.md). The feature reports record their
pre-commit checkpoints. This report records the combined review. Production operation, real import,
merchant activation, external CI and deployment are outside this local integration review.
