> Historical checkpoint preserved from the original Phase15A worktree. Current completion evidence is in [the Stage 1 report](../final-handover/01-security-and-reliability-audit.md). Counts and pending items below describe earlier runs.

# Phase 15A — security and reliability hardening

Status: uncommitted review checkpoint; not a completed full-platform security audit.

Date: 23 October 2026. Branch: `feature/phase-15a-quality-hardening`.
Base: `4699f0e4ee131b820e20d1345a60addcc8d8b46d` (green main at preparation).
Claude's Phase 14B/14C deployment configuration and independent worktrees are outside the edit scope.

## PostgreSQL startup diagnosis

The original downstream Docker error was:

```text
docker: Error response from daemon: cannot join network namespace of a non running container:
container dv15a-53431-pg is exited
```

The isolated PostgreSQL container exited with code **2**, `OOMKilled=false` and an empty Docker state error. Its initialization log established the preceding cause:

```text
LOG: listening on Unix socket "/scratch/.s.PGSQL.5432"
LOG: database system is ready to accept connections
psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed:
No such file or directory
```

PostgreSQL itself started. The official image's initialization client used the default socket directory while the test server used `-k /scratch`. A read-only-root warning about chmod on `/var/run/postgresql` was not the fatal error.

The cached image's `docker_process_sql` explicitly sets `PGHOST= PGHOSTADDR=`. Therefore setting an outer `PGHOST=/scratch` alone did not fix initialization. The temporary harness now sets `PGHOST=/scratch` and, in a disposable scratch copy of the image's entrypoint, changes that one initialization-client assignment to `PGHOST=/scratch PGHOSTADDR=`. Neither the image nor a repository deployment file was changed.

Readiness is checked after initialization through TCP SQL with `ON_ERROR_STOP=1`, not just container state or `pg_isready`:

```sql
SELECT current_database(), current_user, 1+1;
-- phase15a|synthetic|2; exit 0
```

A bounded retry waits for the final TCP server, avoiding the initialization server's temporary startup/shutdown interval. A separate SQL query checks completed migrations in the disposable `phase15a_api_test` database:

```sql
SELECT count(*), count(*) FILTER (
  WHERE finished_at IS NULL AND rolled_back_at IS NULL
) FROM _prisma_migrations;
-- 20|0; exit 0
```

## Environment and preservation

- The dedicated testing window was explicitly confirmed by the user before Docker integration testing.
- Initial recovery diagnostics found 19 GiB available disk, Docker daemon 29.6.1 responding, ten configured CPUs and approximately 7.75 GiB Docker memory. Host `memory_pressure` reported 38% free. The failed PostgreSQL process was not OOM-killed. A later checkpoint had approximately 20 GiB free; the final verification window had approximately 10 GiB free. No unrelated disk cleanup was performed.
- Cached images only; no image builds, pulls, package installation, registry access, global cleanup or pruning.
- Each run has unique `dv15a-<process-id>-{pg,redis,minio,test}` container names. It does not use or operate any existing Compose project.
- PostgreSQL has a network namespace with `--network none`; the other three temporary containers join only that namespace. There are no host port bindings or external network interfaces. Ports 5432/6379/9000 are private to this disposable namespace.
- Database names, account names, credentials, Redis state and MinIO bucket are synthetic Phase 15A fixtures, different from development/staging settings. The test bucket is `phase15a-synthetic-test`; tests never fall back to the original bucket.
- PostgreSQL data, Redis state, MinIO objects, source copies and caches are bounded per-container tmpfs scratch storage. No existing database or object-store volume is mounted. Docker-created anonymous image volumes are private to their newly created test containers; current teardown removes only those attached anonymous volumes and those exact newly created container names.
- The application source and cached toolchain are read-only. Build/test copies and generated output stay in scratch. The Docker socket, host home, `.env` files, real credentials and other worktrees are not exposed.
- Each process starts from an explicit empty/allowlisted environment. Test tools are limited to one CPU, 2048 MiB RAM (1400 MiB explicit Node heap), 96 processes, bounded open files/file size, 512 MiB scratch and a six-minute wall deadline. Fixture services have smaller independent memory/scratch limits.
- API database setup is permitted to recreate only the database on this isolated PostgreSQL server. The original development database is unreachable from the fixture network.
- Existing development and Phase 14A container IDs, start times, restart counts and mounts are inspected read-only. No original database rows or MinIO objects are read or modified for this checkpoint. Preservation evidence is containment plus unchanged service identity/mount metadata, not a claim of a new content-level checksum comparison.

The external harness and bounded logs are under `~/security-audit-skill/univarsity-doc/run-1/`. They are not deployment infrastructure and are not committed.

## Demonstrated defects and focused corrections

All reproduction uses synthetic users and real local API/SQL/Redis interactions. Deterministic hooks finish a legitimate concurrent state change during the relevant hashing/verification await; there are no timing sleeps in the regression schedules.

| Defect family                                    | Baseline observation                                                                                                                                                                                                                      | Correction                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Student activation/recovery uses stale authority | A code expiring during hashing, an account disabled during hashing, and a registration revoked during hashing each returned 200 instead of rejecting.                                                                                     | Re-read current registration/account authority inside a Serializable transaction; require unexpired, unused, unrevoked code at consumption; condition account update on not DISABLED; map expected competing-write conflicts to the existing generic activation error.   |
| Pending login outlives credential replacement    | A staff login using the replaced credential remained usable after password change and test-delivered reset; the equivalent student login remained usable after recovery. Guarded `/auth/me` or `/student/me` returned 200 instead of 401. | Bind every session to a purpose/realm-separated HMAC of the exact stored hash verified at login. Guards compare against the current database credential before attaching authority. Preserve only the legitimate current staff session's new binding on password change. |

Independent source review confirmed the authentication corrections and identified two additional session races. Both were reproduced before correction and independently reviewed again afterward. The wider audit is not claimed exhaustive.

The binding contains neither plaintext passwords nor the stored Argon2 hash. It is internal Redis session metadata and is not returned by the session-list API. Student and staff namespaces remain separate. A mismatched credential denies authority without deleting a potentially concurrent credential replacement or clearing its cookie. Redis activity updates modify only the live last-seen timestamp. Credential replacement compares the live user and previous binding atomically, preserves expiry, and never recreates a revoked session.

No schema migration or public response contract is introduced. Existing sessions lacking the binding fail closed and require a fresh login when this change is eventually deployed. Password-reset email delivery remains unavailable by default; the reset regression uses only the existing test notifier override. No delivery integration is enabled.

## Regression coverage

`apps/api/test/auth/credential-races.test.ts` adds:

1. Pending staff login versus completed password change.
2. Pending staff login versus completed password reset through an explicit test notifier.
3. Pending student login versus completed recovery, preserving the recovered session.
4. Two concurrent valid staff logins, with independent logout behavior.
5. Two concurrent submissions of one activation code, with exactly one successful consumption.

`apps/api/test/student-auth/activation.test.ts` adds expiry, staff disablement and registration revocation during password hashing. Each rejection checks the generic error, absence of a session cookie, unchanged password, preservation of staff disablement, unused activation code and absence of an additional activation audit event.

The first expiry fixture violated the existing issue-before-expiry SQL constraint and returned 500; that was a fixture defect, corrected by setting a valid earlier issue time. It was not counted as a product finding. The first fix run also caught an accidental reset-path reference introduced during editing; it was removed and the targeted suite rerun.

## Commands and actual results

The external runner is invoked as:

```sh
python3 ~/security-audit-skill/univarsity-doc/run-1/run-isolated.py <unique-log-name> [--checks] [--boundaries]
```

It runs the actual installed Vitest CLI in the isolated scratch copy. The focused test selection is:

```sh
vitest run test/student-auth/activation.test.ts test/auth/credential-races.test.ts --reporter=verbose
```

| Run                                                      | Result                                                                                                                                       | Exit |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Original harness                                         | Docker namespace-join failure after PostgreSQL initialization failure; no tests ran.                                                         | 125  |
| Corrected baseline reproduction (`auth-concurrency-red`) | 6 failed, 9 passed, two files. All six failures were the intended stale-state/credential assertions.                                         | 1    |
| First correction (`auth-concurrency-green-1`)            | 14 passed, 1 failed; accidental reset-path edit identified and removed.                                                                      | 1    |
| Corrected focused suite (`auth-concurrency-green-2`)     | 15 passed, two files; migrations 20 complete, 0 unfinished.                                                                                  | 0    |
| First static pass                                        | Typecheck reached lint; lint rejected an async test notifier without await. Changed notifier to the existing Promise-returning test pattern. | 1    |

The final combined command was:

```sh
python3 ~/security-audit-skill/univarsity-doc/run-1/run-isolated.py auth-static-and-boundaries-2gb --checks --boundaries
```

It completed with **exit 0**. Results:

- API typecheck: exit 0.
- ESLint on all seven changed TypeScript files: exit 0.
- API TypeScript build: exit 0.
- Broader integration selection: **132 passed in 18 files**, exit 0, 113.12 seconds of Vitest time. This includes the 15 focused cases; the counts should not be added as unique tests.
- SQL readiness: `phase15a|synthetic|2`, exit 0.
- Migration SQL: `20|0`, exit 0; SHA-256 checks also matched all 20 cached migration files against current source.

The broader selection was:

```sh
vitest run test/auth test/student-auth test/results/student-results.test.ts test/public-verification/verification.test.ts test/certificate-requests/requests.test.ts test/certificate-eligibility/eligibility.test.ts --reporter=verbose
```

This verifies RBAC, staff/student principal and CSRF separation, cookies, CORS, rate limiting, Redis-outage rejection, audit secrecy and append-only behavior, unavailable student results/public verification, and certificate request/eligibility policy gates. It is not the full repository or browser suite.

An intermediate static pass exhausted the deliberately low default Node heap and exited 134 before tests. Only the temporary tools-container allowance was increased to 2048 MiB, with an explicit 1400 MiB Node heap; the application configuration was not changed. Expected negative-path SQL/Redis messages and one existing pg client deprecation warning occurred in the passing suite.

API static checks use the installed TypeScript and ESLint CLIs against current source; API build emits only scratch output. No Turbo test cache is used.

## Scope and remaining work

Source reconnaissance covered authentication, staff/student separation, permission metadata, student ownership queries, academic/result state machines, import/retry paths, private documents, preview renderers and unavailable public verification. This checkpoint prioritizes the user-requested PostgreSQL recovery and demonstrated authentication defects.

Independent review has now covered the three previously outstanding source areas:

- Manual student edits could overwrite a concurrent edit without the expected audit entry. The regression reproduced the missing audit; a student row lock now precedes the before-read and update.
- Registration status edits could restore stale relation identifiers after a concurrent session change. A registration row lock now serializes the before-read and partial update.
- Profile submissions could accept a DOB correction after a concurrent official DOB update. Submission now revalidates proposed changes against the fresh locked student snapshot; rejected uploaded photos use the existing cleanup path.
- Spreadsheet ZIP byte/entry bounds are enforced before parsing. Workbook row/column/sheet limits are checked after ExcelJS parsing. No bounded availability failure was demonstrated, so no speculative parser change was made. Earlier enforcement remains a resource-hardening opportunity.
- The PDF filter-chain probe initially used the PDF.js metadata API incorrectly. After using its Map API, PDF.js recognized the synthetic comment-only action while the scanner accepted it. This confirms a static-content validation bypass; it does not demonstrate script execution. A fail-closed object-stream guard and regressions are now drafted, pending the renewed testing window.

The added independent-review regressions reproduced five failures before correction (two session races and three academic/profile races). An intermediate run passed nine cases but two SQL-lock tests timed out because their test-only query matcher required quoted table names. That matcher now accepts the actual SQL table reference. The corrected lock regressions subsequently passed; the final 12-case review selection and aggregate API results are recorded below.

Serializable activation conflicts are intentionally rejected with the existing generic error rather than retried. Concurrent password changes can produce a fail-closed credential-rebind conflict; no session is recreated. Existing unbound sessions require forced re-login. These are documented compatibility effects, not changes to RBAC or university policy.

Workspace checks and API verification are recorded below. Complete browser verification and the final Graphify refresh are the remaining delivery checks. Graphify retains existing SQL-parser and two barrel-extraction limitations. This report does not claim a production deployment, exhaustive vulnerability coverage, or merge authorization. Existing grading/publication, certificate eligibility/issuance, Rector approval, payments and public verification policies are unchanged. All changes remain uncommitted for review.

## Final independent-review correction

The final source critic identified one additional race in staff password changes. The synthetic HTTP reproduction completed a reset during an earlier password-change hash operation. The pending change returned 401, but its password authenticated (200), while the recovered password failed (401). This demonstrated a stale SQL write, not merely a session timing failure.

The correction conditionally updates the active user only if the stored hash still equals the hash verified by that change request. A competing reset/change or disable therefore rejects before overwriting credentials. Reset retains its existing setter behavior. The independent reviewer checked the correction and regression without finding another concrete issue. No retry, migration, public contract, policy bypass or new reset delivery service was introduced.

Evidence: `password-change-reset-red-3.log` (1 intended failure, 11 passes), followed by `password-change-reset-green.log` (12 passed, exit 0; migrations 20 complete, 0 unfinished). The earlier first attempt failed in Supertest because a request was created before fetching CSRF; that test sequencing error was corrected before the decisive reproduction.

## Final workspace verification (23 October)

The cached toolchain lacks a Linux pnpm executable; its cached host pnpm binary is macOS-only. The offline runner therefore invokes each workspace's actual `package.json` script sequentially, without Turbo cache. Its minimal `pnpm` adapter supports only installed-tool `exec`, adding the current workspace bin directory to PATH. No dependency installation or version substitution occurred.

Completed workspace test totals before the subsequent PDF correction (unique cases, excluding repeated runs):

| Workspace             |   Tests |   Files |  Exit |
| --------------------- | ------: | ------: | ----: |
| database              |     109 |      14 |     0 |
| documents             |      68 |       5 |     0 |
| imports               |      94 |       8 |     0 |
| storage               |       4 |       1 |     0 |
| types                 |      21 |       1 |     0 |
| validation            |      68 |      10 |     0 |
| API, final correction |     434 |      51 |     0 |
| web                   |     129 |      25 |     0 |
| worker                |       7 |       3 |     0 |
| **Total**             | **934** | **118** | **0** |

All workspace lint and typecheck scripts passed. Final API lint, typecheck and exact `nest build` passed again after the conditional password update. Full-root format checking passed in the complete filtered source copy. Expected Redis/SQL negative-path logs, an existing pg concurrency deprecation, a TanStack React Compiler warning and shared UI ESLint pages warning did not fail their checks.

Runner corrections were limited to external disposable infrastructure: current-workspace Prisma PATH; read-only cached dependency mounts inside Next.js's workspace boundary; writable scratch parent directories; and offline font resources. The existing Next.js Google Fonts loader needs network resources, so the sandbox uses its test-only response mechanism plus cached Inter/Plus Jakarta Sans Latin font files served over fixture loopback. The unmodified network-dependent build failed offline; this is not evidence of a product regression. No remote resources, installs or production deployment were tested.

Full verification uses one CPU per tool container, 4 GiB memory, explicit 2 GiB Node heap, 256-process limit and bounded tmpfs/write/file/wall limits. Read-only nested dependency mounts require separate scratch mount points. The font server has no host port and shares only the unique fixture network namespace. The prior six-minute/2-GiB limits describe targeted checks, not the full run.

Evidence logs outside the repository: `full-workspace-gates-2.log` (all initial 933 tests, lint and typecheck pass; offline dependency-resolution build failure), `final-affected-gates-1.log` (final 434 API tests and API static/build checks pass; same old runner build boundary), and the final build/browser run. Browser and drift results will be recorded after completion.

## Security assessment and deployment impact

| Remediated area                                    | Priority and impact                                                                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Activation authority and stale-credential login    | High: a credential or authority change must take effect even when hashing/login began earlier.                                                  |
| Reset versus pending password change               | High impact when reset delivery is configured: a stale request could replace the recovered credential. Default reset delivery remains disabled. |
| Redis activity/rebinding races                     | Medium: legitimate credential changes could lose their preserved session or live binding.                                                       |
| Manual record snapshots and registration relations | Medium: concurrent official writes could be lost or bypass the expected field-change audit.                                                     |
| Missing-DOB request lifecycle                      | Medium: a stale submit could bypass the missing-value policy and propose replacing a newly populated official field.                            |

The authentication and academic issues above are remediated with passing focused regressions. The subsequent PDF safeguard remains pending runtime validation. Source review and tests support these specific conclusions, not an assertion that every possible vulnerability has been excluded. No dependency advisory inventory, deployed reverse proxy, real email delivery or production capacity claim is made.

Deployment requires no migration. Existing staff/student Redis sessions without credential bindings will require login again. Redis session operations now require EVAL plus GET/SET on their existing session keys; deployment ACLs should permit those commands (no ACL configuration is changed here); no new external service or public endpoint is added. Ordinary activity preserves the live binding and absolute expiry, and conditional password writes fail closed on concurrent replacement/disablement. No automatic Serializable retries were introduced.

## PDF correction and renewed testing window

The decisive metadata-only probe is retained as `pdf-inert-1792716214030077000.log`: a 724-byte valid one-page synthetic PDF exposed the comment-only OpenAction through PDF.js metadata, while `assertStaticPdf` did not reject it. No viewer, action execution, external URL or real document was used. The earlier failed probes were metadata assertion mistakes, not evidence that the file was invalid.

The proposed guard rejects compressed object streams after the existing encryption/active-name checks. It preserves existing forbidden-content errors and the bounded inflate budget. It intentionally narrows accepted **new historical-document uploads and payment evidence PDFs**; users must re-export affected PDFs as plain scans/prints. PNG/JPEG evidence and ordinary static PDFs retain their existing path. Existing originals, published documents and MinIO objects are not rewritten or revalidated.

Independent read-only review confirmed the demonstrated case and identified a PDF NUL-whitespace tokenization variant that still needs reproduction before any tokenizer correction. A corresponding inert fixture/test is prepared. Do not describe this guard as fully verified yet. API regressions cover historical-document refusal before storage/record creation and payment-evidence refusal before successful submission. These new cases have not run.

The completed full browser run (`final-build-browser-gates-4.log`) had **71 passed, 2 timed out and 4 dependent tests not run**, exit 1, 14.2 minutes. Both failures hit the existing 30-second whole-test deadline: the long historical-document upload/replace/withdraw flow and the payment review flow. No safety assertion was weakened. Their cause remains to be verified in a fresh isolated run; neither is being called an application defect or a clean pass. The web production build and database drift check in that run passed (exit 0; no difference detected). Cached fonts were served over fixture loopback.

Before the shared environment changed, a read-only preservation comparison matched all ten baseline service identities, start times, restart counts and normalized mounts. The cached Phase 14B tools/API images later became unavailable and other shared services changed. Phase 15A did not perform those changes; its own exact-name test fixtures had been removed. No current preservation equivalence is asserted for services changed outside this run.

The user requested source review while arranging a renewed coordinated window. Heavy tests are paused. Remaining work: metadata-only NUL reproduction, smallest demonstrated tokenizer correction if needed, new PDF/payment regressions, affected API/static checks, complete browser verification including the timed-out flows, final preservation evidence and final Graphify refresh. All changes remain uncommitted; no PR, push or merge is authorized at this checkpoint.
