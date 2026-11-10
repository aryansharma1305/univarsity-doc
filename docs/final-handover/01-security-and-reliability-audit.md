# Stage 1 — Phase 15A security completion

Assessment window: 9–10 November 2026. **Local verification complete; delivery review pending.**
Branch: `fix/phase-15a-security-completion`, baseline
`d791afd7da3b0efc2db7965cc3a2fa6417a90d60`.

## Current checkpoint — authoritative status

The owner authorized resource-monitored battery testing when a sufficient safety margin exists.
The corrected complete suite passed **all 78 tests**, exit 0, with no skips or dependent cases omitted.
The production security source is unchanged from the 952-test full unit/integration run and scoped
independent reviews. Four browser specs now have reproduced synchronization/event-selection fixes.
Local Stage 1 verification is complete; final delivery review, commit/push and CI remain outstanding.
No commit, push or PR has been made. Additional application integration work is in a separate
release-candidate worktree and is not covered by this security sign-off.

| Evidence                                         | Actual result                                                                                                                            | Exit |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---: |
| Targeted imports/static gates                    | 101 imports tests; lint/typecheck passed                                                                                                 |    0 |
| Targeted API/static gates                        | 173 API tests; lint/typecheck passed                                                                                                     |    0 |
| Full uncached unit/integration selection         | 952 tests in 121 files passed                                                                                                            |    0 |
| Full format/lint/typecheck/build/drift stages    | Passed; no schema difference                                                                                                             |    0 |
| First complete browser run                       | 76 passed, 1 ENOSPC failure, 1 dependent not run                                                                                         |    1 |
| Instrumented browser run                         | 74 passed, 3 failures, 1 dependent not run; sleep-interrupted                                                                            |    1 |
| Focused examination/payment control, tracing off | All 5 passed, unchanged deadlines/assertions                                                                                             |    0 |
| Final complete tracing-off browser run           | 78 passed; 0 failed/skipped/not run                                                                                                      |    0 |
| Graphify code refresh                            | Three generated outputs; known extraction limits documented                                                                              |    0 |
| Latest preservation checkpoint                   | 21 existing container records unchanged; original volumes present; original 21 modified files SHA-identical; zero active test containers |    0 |

Independent authentication, upload/resource and final integrated source reviews found no additional
concrete defect after the reproduced corrections. This is scoped review evidence, not an exhaustive
security certification. The final uninterrupted browser run and preservation checks passed as
recorded below. Human delivery review and final-SHA CI remain outstanding.

Earlier retained log envelopes inherited stale resource labels. Raw logs remain unchanged. The
external `resource-metadata-errata.json` records actual launch settings: targeted/full runs used two
CPUs and 4 GiB memory; instrumented/focused browser runs used two CPUs and 5 GiB memory with the
larger tmpfs bounds below. Final-run metadata now derives directly from its launch arguments.

The isolated post-run API-test DB query is inapplicable to browser-only attempts that create only
`phase15a_e2e`; its missing-DB exit is not hidden or counted as a passing test. The focused browser
runner uses the correct e2e DB and its migration query passed (`20|0`).

## Source preservation and environment

The original Phase 15A worktree and all 21 changed files were SHA-256 recorded outside the repository.
Only its API source/test diff and untracked regressions/report were applied to a fresh main-based
worktree. The patch applied cleanly. Old generated graph outputs were not copied. Stage 0 documentation
remains intact in its independent worktree. No schema or academic policy change is included.

Docker socket diagnosis: Docker Desktop backend was stopped; the networking helper alone was alive.
After the owner expressly authorized startup and automatic container resumption, Docker Desktop was
started without resetting, pruning or manual service restarts. Three development services resumed.
The fresh baseline records all 21 existing containers, mounts and volume names outside Git. Engine
29.6.1 reports ten CPUs and about 7.75 GiB memory; disk had about 12 GiB available. No original DB or
object-store content was read or changed.

Testing uses disposable uniquely named containers in a network namespace with no external interface
or host ports. Target/toolchain are read-only; scratch writes, resource limits and explicit synthetic
allowlisted environments are retained. Only exact newly created test containers/anonymous volumes are
removed. No Docker socket or existing data volume is exposed to target code. Cached dependencies and
images only; no downloads or installation.

## Confirmed cases and corrections

- Existing activation expiry/disable/revocation, stale login and live-session races: prior reproduced
  fixes preserved; independent source review completed. Fresh targeted and full API regressions pass as recorded below.
- Credential-bound sessions: missing bindings fail closed. **All existing unbound staff and student
  sessions require re-login after deployment.** No legacy fallback or account migration is introduced.
- Password change versus completed reset: verified-hash/active-user conditional SQL update preserved.
- Reset token issuance/consumption races: both reproduced against isolated Redis (two intended
  failures). Atomic Lua replaces read-plus-MULTI and GETDEL-plus-delete. Consumption checks the current
  token pointer, so orphan/superseded tokens cannot reset a password. Two focused cases passed after
  correction. Default reset delivery remains disabled.
- Reset versus a newer completed reset: a deterministic synthetic HTTP test reproduced the stale
  overwrite (200 rather than required rejection). Conditional SQL replacement now rejects changed
  credentials/disabled accounts and maps that conflict to the existing generic invalid-token response.
- PDF encoded-object-stream/NUL cases: inert PDF.js metadata inspection recognized both comment-only
  actions; the NUL variant bypassed the draft guard. NUL whitespace normalization now precedes name
  scanning. Both metadata-only cases passed; no script or viewer action was executed.
- Spreadsheet sparse allocation: a 7,006-byte synthetic XLSX passed ZIP verification but exhausted a
  256 MiB Node heap during full loading. Twenty/50-row inspection controls also demonstrated large
  blank-cell allocation. Structural SAX checks now run while ZIP entries are already decompressed,
  before ExcelJS loading; nonempty row iteration avoids allocating sparse gaps. Saxes 6.0.0 is promoted
  from an already cached/locked dependency to a direct import dependency; no package fetched.
- Academic/profile row-lock and fresh-snapshot fixes preserved. Rejection regression additionally
  checks that the temporary photo object was removed.

## Compatibility and independent review

New PDFs using compressed object streams are refused for historical uploads **and payment evidence**;
users must re-export as plain static PDFs. Existing stored PDFs are not rewritten or revalidated. PDF
metadata privacy remains a separate unresolved university decision.

Spreadsheet structural ceilings are 500 columns and row position 200,001, in addition to configured
nonblank-data limits. Sparse/styled blank positions beyond those bounds can now be rejected. XML DTDs
are refused. The discarded ExcelJS streaming-reader draft could leave temporary files on early exit;
independent source review caught this before adoption. The current SAX design creates no temporary
files or document tree and retains byte/inflate checks.

Independent authentication review confirmed the preserved fixes and identified the newly reproduced
reset cases. Upload/resource review identified the NUL gap, sparse-grid path and streaming cleanup
issue. Revised-source review and a fresh final integrated source review found no additional concrete
defect. Full static/unit/build/drift gates and the final browser rerun pass as recorded below.

## Test evidence and remaining work

Retained bounded logs and harnesses are outside the repository under
`~/security-audit-skill/univarsity-doc/phase15a-closure/`. Actual inner exit codes are used; the parent
harness's cleanup success does not imply a passing test.

Completed: PDF metadata probes (1 failed/1 passed before NUL fix; 2 passed afterward); reset-token
race tests (2 failed before fix; 2 passed afterward); newer-reset HTTP regression (1 intended failure
before fix, then the focused auth selection passed). Synthetic SQL readiness returned
`phase15a|synthetic|2`; all 20 migrations completed with none unfinished.

Completed: resource rejection/control probes after SAX correction; targeted imports/API gates; independent final source review; Graphify regeneration. Full workspace static/unit/build/drift checks also pass. Browser verification and final preservation comparison subsequently passed. Earlier 934-test and
71-pass/2-timeout/4-not-run browser totals are historical only, not current final evidence.

No commit, push, PR, tag, public deployment, live payment, issuance, publication or real-data import.

## Fresh integrated results

Targeted run: `caffeinate -i python3 ~/security-audit-skill/univarsity-doc/phase15a-closure/run-targeted.py targeted-security-4`, inner exit **0**. Imports lint/typecheck and 101 tests passed; API lint/typecheck and **173 tests in 21 files** passed. Earlier targeted attempts stopped on test-only lint errors (void arrow bodies/empty callback); corrected without weakening assertions.

Full run: `caffeinate -i python3 ~/security-audit-skill/univarsity-doc/phase15a-closure/run-full.py full-security-gates-1`.

| Workspace  |   Tests |   Files | Test exit |
| ---------- | ------: | ------: | --------: |
| database   |     109 |      14 |         0 |
| documents  |      68 |       5 |         0 |
| imports    |     101 |       8 |         0 |
| storage    |       4 |       1 |         0 |
| types      |      21 |       1 |         0 |
| validation |      70 |      11 |         0 |
| API        |     442 |      52 |         0 |
| web        |     130 |      26 |         0 |
| worker     |       7 |       3 |         0 |
| **Total**  | **952** | **121** |     **0** |

Format, all workspace lint/typecheck, package builds, API `nest build`, worker build, Next production build and Prisma drift check passed. Drift output: **No difference detected**. These are actual workspace `package.json` scripts invoked sequentially, uncached, by the offline runner rather than a claimed native Linux pnpm/Turbo invocation. The cached host pnpm binary is macOS-only. The runner resolves exact cached dependency versions and supports installed-tool `pnpm exec` for existing test helpers; it does not install or fetch packages.

The production build used cached Inter/Plus Jakarta Sans Latin assets through Next's test-only font response mechanism and a loopback-only fixture font server. No application font configuration was changed. A normal internet-dependent font fetch was not tested in this network-denied environment. Fixtures/build/test data are synthetic and disposable.

Tool container limits: two CPUs, 4 GiB memory, explicit 2 GiB Node heap, 256 processes, bounded scratch/tmpfs/file/output and one-hour overall deadline; browser phase has a 30-minute bound. Separate services have smaller limits. Original Docker services are outside this network. PDF/resource probes use one CPU, 768 MiB container memory, 256/512 MiB heaps, bounded scratch, no network and a 50-second command deadline. The failing XLSX process hit its explicit 256 MiB heap, not a host/global Docker memory failure.

The revised sparse XLSX rejection stayed around 104 MiB RSS; the ordinary 100-row control also passed. Central/local filename disagreement was reproduced with one row, then rejected after content-based classification. Tests additionally cover entity-decoded references, extreme row positions, BOM/whitespace, malformed XML and DTD refusal. No temporary-file parser path remains.

Graphify `update .`: exit **0**, three required generated artifacts only. Existing extraction limitations: missing SQL parser for 22 SQL files and partial extraction of two TypeScript export barrels. This is navigation evidence, not semantic verification. Source compilation passes independently.

### Deployment and residual assessment

Deploy this security build consistently across API instances; do not retain old auth code during a mixed-version rollout or roll back to known vulnerable auth code without explicit security review. Existing unbound staff/student sessions require fresh login. Redis ACLs must permit the existing session/reset namespaces and Lua GET/SET/DEL/GETDEL operations; these tests use standalone Redis, not Redis Cluster. No schema migration is added.

Confirmed baseline priorities: high-impact credential/activation revocation failures; conditional reset races when notifier delivery is configured; medium integrity/availability concerns for record snapshots, session activity and authenticated upload inspection. PDF reproduction demonstrates acceptance of forbidden static content, **not script execution**. Dense valid XLSX capacity remains a bounded-resource operational risk, not an assertion that the structural preflight makes every workbook heap-safe. Default notifier, publication, issuance, signing, public verification and live financial activation remain disabled/unchanged.

Preservation after targeted checks: all 21 pre-existing container records (IDs/start times/status/restart counts/mounts) matched the post-start baseline; all original named volumes remained present; all original 21 modified Phase15A files stayed SHA-256 identical. This is metadata/containment evidence, not a new original-data content checksum comparison. No original database, object or backup was queried.

### First complete browser run and harness follow-up

`full-security-gates-1`: all 952 unit/integration tests and static/build/drift gates passed, but the overall run exited **1** because Playwright had **76 passed, 1 failed, 1 dependent test not run**. The failure was `ENOSPC: no space left on device, write` during the payment test's API/browser context close, at 16.3 seconds; it was not a payment assertion or test-deadline failure. The previously timed-out historical-document lifecycle passed in 29.2 seconds under the unchanged 30-second budget. That small margin remains a QA timing risk on slower machines.

Host disk still had about 12 GiB free. The failed runner's tmpfs bounds were 1,408 MiB for the source/build directory, 1,536 MiB for parent temporary files and 8 MiB for root node_modules scratch. Their exact usage at failure was not retained, so the specific exhausted mount is not yet claimed. No host/shared-resource cleanup was performed.

`browser-security-gates-2` reruns prerequisite builds, drift and **all** browser cases with filesystem sampling, two CPUs, 5 GiB memory, 2 GiB source tmpfs, 2 GiB parent tmpfs and 64 MiB root node_modules tmpfs. This attempt stopped on formatting in two newly written Markdown files before browser execution (exit 1). Formatting was corrected. No application test ran in that attempt; the instrumented rerun is recorded below.

### Instrumented browser diagnosis and focused control

The instrumented `browser-security-gates-3` completed with **74 passed, 3 failed, 1 dependent case not run**, exit 1. Payment hit the unchanged 30-second test deadline; later mobile profile/student workspace assertions also failed. This run was interrupted by actual host sleep: `pmset` records **Clamshell Sleep at 00:28:03 on 10 November (Asia/Kolkata)**, followed by maintenance sleep/wakes. Long sleep can invalidate time-bound sessions; no session TTL or authorization check was relaxed. These interrupted results are not final acceptance evidence.

Filesystem samples establish that repository scratch reached **1,466,452 KiB**, above the earlier **1,441,792 KiB** quota. Other sampled mounts remained small. This supports artifact-capacity exhaustion as the first `ENOSPC` cause. Retained diagnostics, especially tracing across many contexts, grew the private test-results directory; no original disk, volume or object needed cleanup.

A focused control ran examination prerequisites plus the desktop/mobile payment cases with **diagnostic tracing off**, keeping the same assertions, screenshots, application code and 30-second deadline. `payments-no-trace-probe`: **5 passed, exit 0**, 1.5 minutes. Desktop payment took **24.6 seconds** and mobile **7.6 seconds**. Rebuilt API/worker/web and drift checks passed; the applicable synthetic e2e database migration query returned 20 complete, 0 unfinished.

The next full browser-only rerun disables diagnostic traces in the external runner via Playwright `--trace=off`; screenshot actions and every functional/security assertion remain active. The source Playwright configuration is unchanged. This means no trace ZIPs from the final run; prior failure text and resource samples are retained. A stable awake-host window is required before starting. No test deadline, login expiry or university policy gate is weakened.

### Final-browser preflight — 10 November, 05:45 IST

The owner authorized final browser validation, conditional on connected power and a stable awake
host. Docker responded normally (29.6.1, ten CPUs, 7.75 GiB daemon memory); three original development
services were running. Host disk had 8.5 GiB available. macOS reported no thermal or performance
warnings; the host has 16 GiB RAM and about 3.58 GiB swap in use. Existing services' sampled memory
usage was approximately 98 MiB PostgreSQL, 20 MiB Redis and 214 MiB MinIO. These are preflight
observations, not resource measurements from a final test run.

The runner remains bounded to two CPUs, 5 GiB memory, 256 processes, a 2 GiB Node heap, 2 GiB parent
scratch, 2 GiB repository scratch and 64 MiB node_modules scratch. Its network remains an isolated
loopback namespace with no host ports, external interface or existing data-volume mounts. The full
browser selection adds only `--trace=off`; no test selection, assertion, timeout or screenshot action
is changed. No target execution occurred during this preflight.

The Mac reported **battery power at 56%**, so the connected-power prerequisite was not met. The owner
then requested **source work only**. The final browser run was therefore **not started**. No passing
browser total or elapsed/resource result is claimed for this attempt.

All 21 original container IDs, start times, statuses, restart counts and mount definitions matched
the recorded baseline; mount lists were compared by destination because Docker returned two lists
in a different order. All original volume names remained present and all 21 modified files in the
original Phase15A worktree remained SHA-256 identical. Evidence is retained outside Git in
`final-browser-preflight.json`. No original database/object content, credential or backup was read or
modified. This is isolation and metadata evidence, not a content-checksum verification of university
records. Graphify's three generated outputs remain unchanged from the completed source refresh.

### Uninterrupted browser validation and reproduced teardown races

`watch-final-browser.py` / `browser-security-final-1`: **71 passed, 3 failed, 4 dependent cases not run**;
actual browser exit **1**, 11.5 minutes; wrapper elapsed **807.727 seconds** including setup/cleanup.
The wrapper process exits 0 for successful cleanup; that is not the browser result. Migration SQL
returned `20|0`, exit 0. No safety stop, host-sleep interruption or tmpfs exhaustion occurred. Battery
samples were 48–45%; no recorded thermal/performance warnings. Sampled tool peaks were 2,091 MiB
memory, 208.4% CPU and 168 processes; host free disk stayed at least 5.89 GiB. These are sampled peaks.

Actual failures: the student document retained its unverified label after staff review; student profile
history lacked the rejection; the next mobile profile case lacked the edit form because the same
fixture still had a pending request. Source showed that the staff assertions could match the review
dialog radio label or filled rejection textarea before the POST finished, then close the context.

A controlled 400 ms request delay in **disposable test copies only** reproduced both original assertions
with `responseSeen: false, dialogVisible: true`. The red control had 1 pass, 3 failures and 4 dependent
cases not run, exit 1. Adding a successful-response assertion and dialog-hidden assertion before the
existing text assertions made **all 8 cases pass**, exit 0, with the same latency and original deadlines.
The corrected diagnostics showed `responseSeen: true, dialogVisible: false`. Combined control runner
elapsed **250.891 seconds** including builds; inner differential result 0. No application change was
needed for these races. The source patch adds only those waits in two browser specs; no assertion,
test selection, timeout, screenshot or security check is removed. No artificial delay or diagnostic
logging is added to repository tests. A normal complete rerun is still required.

### PDF download event diagnosis

The next complete run (`browser-security-final-2`) passed **77 tests** and failed **1**, browser exit 1,
10.8 minutes; wrapper elapsed 792.376 seconds. All document/profile teardown cases passed. The one
failure expected `sample-marksheet-semester-v1.pdf` but received a blob UUID filename.

A disposable-copy control reloaded the PDF iframe while delaying the anchor click by 400 ms. Both
marksheet and training-certificate links had the correct download attribute. Chromium emitted an
automatic iframe download with a UUID name **and** the user-clicked download with the correct sample
name. The original unfiltered waiter selected the iframe event: **2 failed, 2 passed**, exit 1. Using
the existing academic-preview test pattern to select `sample-` downloads produced **4 passed**, exit
0, while retaining every exact filename assertion. The combined differential run took 153.763 seconds.
The temporary iframe reload, click delay and diagnostics are not in repository tests.

The repository correction narrows the two download-event waiters and adds an independent exact
`download` attribute assertion. The original exact suggested-filename, PDF/security-header, viewport,
keyboard, reduced-motion, screenshot and saveAs checks remain. Wrong sample filenames still fail the
original equality assertion; absent/corrupt named downloads still fail the unchanged test deadline.
No PDF/UI/API implementation change was needed. The corrected complete run subsequently passed below.

### Final local security acceptance evidence

`watch-final-browser3.py` / `browser-security-final-3`: **78 passed, 0 failed, 0 skipped, 0 not run**,
actual browser exit **0**, 10.7 minutes; wrapper elapsed **782.421 seconds** including setup/cleanup.
Format, affected web lint/typecheck, prerequisite package builds, API/worker/web production builds
and drift checks passed; the synthetic migration query returned `20|0`, exit 0. Assertions, test
deadlines, screenshot actions and all security checks remain. No diagnostic request delays, iframe
reloads or diagnostic logging are present in repository tests. Diagnostic tracing alone was disabled
by the external runner; repository Playwright configuration is unchanged.

Final measured resource/preservation summary is retained in external `phase15a-final-local-evidence.json`.
The final source inventory has **36 paths**, including the four browser specs and three required
Graphify outputs. Graphify refresh exited 0 (no further topology change; known parser limitations
above). All 21 original container metadata records matched, all original named volumes remain and
all 21 modified original-worktree files remain SHA-identical. No test container remained at this
checkpoint. Preservation is containment/metadata evidence, not a content-checksum comparison of
university records. Original DB/object/backup content was not queried; no original credential values
were printed, retained or changed. No service reset, volume deletion, prune or original-data migration.

This is local review-ready security evidence, not a merged release, final-SHA CI result, Hostinger
deployment verification or certification of the additional release-candidate integrations.
