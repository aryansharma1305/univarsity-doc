# Shared-proxy and launch-preparation verification

PR #34 historical local review: 13 November 2026. Branch `feature/shared-proxy-coexistence`, based on merged main
`1b260b991faafdfc472ce9628382211ac5b52237` (PR #33 simplified homepage). Latest main was checked again
before PR preparation. The code knowledge graph was refreshed with `graphify update .` in scratch
and its three generated outputs copied back without hand-editing. The tool reported its existing
SQL-parser dependency limitation and two partial TypeScript extraction warnings; source remains authoritative.
The exact pushed commit and CI/artifact identities belong in the PR and final
handover record. No Hostinger operation or release approval is implied by a local pass.

## Review scope and changes

Reviewed all 24 implementation, test, workflow and operator-document files, plus any generated
knowledge-graph refresh. No schema/migration, homepage, academic policy or payment behavior changed.
No dependency was added. The privacy check compared changed source against 157 distinct known student
name/registration/identity values without printing them, provider-token/private-key patterns and
locally generated test credentials; no matches or private/binary files were found. This is a bounded
check, not a universal secret detector. The workbook stays outside Git and was never uploaded.

- Separate shared Caddy owns the public listeners, staging certificate volumes and unchanged reviewer
  policy. University has a unique web DNS service and independent PostgreSQL/Redis/MinIO, keys,
  volumes and internal backend. The edge never joins university backend.
- Staging adoption metadata is checked by hash and an independent instance flag. Staging start, stop,
  backup and gate failures do not operate the shared edge or university project. Restore excludes
  public/shared overlays and uses the correct instance environment for fingerprint queries.
- New staff-only CLI refuses Super Admin and old images fail closed because its entry file is absent.
  Existing hidden prompts, Argon2id, password policy, duplicate refusal and transactional audit remain.
- Final validation fixed BusyBox root `test -w` rejecting a valid read-only gate. Startup now checks
  permission bits with Linux/BSD stat, refuses writable/malformed/empty gates and is exercised in the
  pinned image. Preparation also rejects references to external/staging backend networks or volumes.

## Verification results

| Check                                                        | Result                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean university configuration tests                         | 7 passed                                                                                                                                                                                                                                                                         |
| Coexistence/configuration/isolation/lifecycle/resource tests | 16 passed, including native Compose parsing of all three models                                                                                                                                                                                                                  |
| Staging/release/backup/refusal regressions                   | 32 passed                                                                                                                                                                                                                                                                        |
| Standalone staff argument/role/Argon2id/audit unit tests     | 15 passed                                                                                                                                                                                                                                                                        |
| Focused synthetic total                                      | **70 passed** on the final startup/network checks                                                                                                                                                                                                                                |
| Full workspace lint and TypeScript                           | Passed, uncached                                                                                                                                                                                                                                                                 |
| Fresh synthetic database migrations                          | All applied successfully; no existing database used                                                                                                                                                                                                                              |
| Schema drift                                                 | Passed: **No difference detected**                                                                                                                                                                                                                                               |
| Existing reviewer gate runtime/configuration                 | Passed all 16 checks, including local/public invalid-gate refusal and missing bind-source refusal                                                                                                                                                                                |
| Pinned Caddy parser                                          | Passed: distinct hosts, authentication order, admin disabled, invalid/missing gate refusal                                                                                                                                                                                       |
| Pinned Caddy runtime                                         | Passed: trusted internal HTTPS, anonymous/wrong gate denial, concurrent two-site smoke, strict SNI/Host refusal, private-network reachability/denial, staging maintenance continuity, handoff, USR1 reload/config rollback, empty-gate restart refusal, return to original proxy |
| Resource performance                                         | **Not accepted**: first authenticated reviewer requests took 16.654 / 16.689 / 19.808 seconds at the proposed 0.1-CPU ceiling                                                                                                                                                    |
| Full local production build                                  | Blocked: Next.js Google Fonts fetch denied by the external-network sandbox; other package builds passed                                                                                                                                                                          |
| Full API unit/integration run                                | **505 passed / 5 failed across 57 files**; the five PDF-preview failures are sandbox Chromium stream errors; all 6 admin DB tests and 15 staff unit tests passed                                                                                                                 |
| Full local unit/integration command                          | Attempted; Chromium PDF stream reads fail under the sandbox, so the command is not a pass                                                                                                                                                                                        |
| Local application browser/E2E                                | Blocked by the missing completed web production build; not claimed passed                                                                                                                                                                                                        |
| Formatting / whitespace                                      | Checked before commit; CI repeats full formatting                                                                                                                                                                                                                                |
| Private workbook                                             | 58 unique registrations, 55 Active/3 Inactive, DOB/photo blank for 58; original unchanged; no detected source ID values in prepared copy                                                                                                                                         |

The transport rehearsal uses real pinned Caddy and the actual generated policies/startup wrapper,
synthetic HTTP upstreams, internal backend networks and one loopback-only HTTPS listener. It substitutes
internal TLS for ACME and records aggregate evidence at `test-results/coexistence.json`; CI retains
that report separately. It does **not** prove application RBAC, database credential rejection, public
ACME/DNS, real student behavior or target-host capacity. Certificate volumes from local rehearsals
are retained; no existing staging/recovery resources are removed.

The application check uses an exact source copy, existing cached dependencies, a bounded 6-GiB scratch
filesystem and a new synthetic tmpfs-only PostgreSQL/Redis/MinIO project. External network, original
checkout writes and private host files are denied; only local test traffic is allowed. Environment
values are allowlisted and synthetic. CPU/file/process/memory/wall-time bounds are enforced. Tool
cache paths and preinstalled Prisma binaries are directed into scratch; no dependencies are installed.
The original application source/toolchain remains unchanged. CI runs the normal build/test/browser
commands on the exact head SHA, including the new staff DB integration cases.

Reproducible focused checks (Docker commands create only synthetic local resources):

```bash
python3 deploy/university/test_clean.py
python3 deploy/scripts/test_staging.py
CI=true python3 deploy/coexist/test_coexist.py
python3 deploy/coexist/caddy_regression.py
python3 deploy/coexist/runtime_regression.py
pnpm --filter @docversity/api exec vitest run --config vitest.cli.config.ts
pnpm lint --force
pnpm typecheck --force
```

## Security, recovery and deployment decision

The encrypted off-server design separates environment destinations, upload/decryption identities,
retention authority and object/database capture, refuses queued work and requires an independent
isolated restore with table/object equality and activation/session handling. No off-server backup,
key-custody test or independent data restore occurred here. CI's synthetic staging restore is separate
from real disaster-recovery acceptance. SSH/key/console access, patch/reboot recovery, secret rotation,
MFA/recovery decisions, log redaction and alert delivery still require operator/university acceptance.

**Not ready for Hostinger deployment yet.** PR #34 was merged as `cadc644`; the subsequent performance
fix and its new exact-source CI/load results are recorded in [performance evidence](shared-proxy-performance.md).
Review and target-host acceptance against agreed full-stack latency/load goals remain required before any
resource update. Keep the bcrypt work factor and throttles. Do not interpret a memory-ceiling sum or
successful synthetic transport smoke as capacity certification.

Remaining gates: approved immutable source/archive and image IDs, two-site full-stack synthetic UAT
and load peaks, public hostname/DNS/TLS prerequisites, staging backup/recovery point, encrypted
independent off-server restore, host/SSH/reboot/monitoring review, staff identity/recovery/MFA decision
and institutional approval of academic/session/status/person mappings and real-data handling.

See [operator sequence and rollback](shared-proxy-coexistence.md), [backup/recovery](shared-proxy-recovery.md)
and [launch/reconciliation](university-fast-track-launch.md). No VPS login, DNS change, real account,
student upload/import, payment activation, merge or deployment was performed. The first port handoff
and a single-host reboot have an interruption; zero downtime is not promised.
