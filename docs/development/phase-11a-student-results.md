# Phase 11A — Student Results portal and release boundary

## Baseline and scope

Branch `feature/phase-11a-student-results` in a separate worktree from latest main
`7f676fd3e36323781d0458e65efbffafd6b1650e`. UI-03 (#15) and Phase 10D (#12) are merged.
[Main CI](https://github.com/aryansharma1305/univarsity-doc/actions/runs/38115837677) passed.
The approved UI-03 preview remains running independently on localhost:3000; its worktree, build
and service configuration are unchanged. The before screenshot uses a normal login into one
synthetic account in its isolated preview database, producing the existing last-login/audit records.
No existing database is reset, migrated, reseeded or deleted. No applied
migration, knowledge graph, grading policy or publication policy changes belong to this phase.

## Publication contract and explicit safety boundary

Current `Result.publicationStatus` has DRAFT, UNDER_REVIEW, APPROVED, PUBLISHED, WITHHELD and
SUPERSEDED states. The database requires non-null `outcome` and `publishedAt` for PUBLISHED; original
subject outcome/marks guards remain. A partial unique index allows at most one PUBLISHED revision
per registration/examination/attempt. Published rows are immutable except allowed withholding or
supersession transitions; superseded history is immutable. Review receipts freeze marks versions
and document internal submission/approval, not an official release.

Phase 10D's `RESULT_REVIEW_POLICY.publicationEnabled` is hard-coded false, its publish action
rejects requests, and the database independently rejects publication of reviewed results. Legacy
schema-valid PUBLISHED rows are not sufficient evidence of an authorized release: there is no
approved publishing-actor/scope provenance contract, cohort release/embargo contract or official
attempt-selection policy. Neither a timestamp nor an internal approval proves release eligibility.

**Published-record API implementation stops here.** This phase adds authenticated routes and the
real empty/error UI, but never queries Result/ResultItem or review receipts to guess publication.
The live list is empty and every well-formed result ID returns the same 404. This also excludes
legacy PUBLISHED rows rather than silently trusting them. There is no environment flag, temporary
bypass, fake published fixture, inferred grade or writable student result endpoint. Opening reads
requires a separately reviewed publication-provenance and release-eligibility implementation; merely
changing the internal approval policy cannot open this boundary.

## API and validation

- `GET /api/v1/student/results`: validated bounded `page` (1–100,000) and `pageSize` (1–100,
  default 25); unknown filters, including student IDs/registration numbers, are rejected.
- Response: `{ publicationAvailable: false, data: [], meta: { page, pageSize, total: 0,
totalPages: 0 } }`. The strict Zod schema permits only an empty tuple. No speculative official
  marks contract is introduced before publication is trustworthy.
- `GET /api/v1/student/results/:id`: UUID validation, then generic `404 NOT_FOUND`. Own, foreign,
  draft, approval-only, legacy-published and nonexistent IDs are indistinguishable. Malformed IDs
  return the existing generic validation response, independently of record existence.
- Both routes reuse `@StudentRoute()`/`@CurrentStudent()`. The global student guard reads only the
  student session, derives identity and reloads the active account; a staff cookie is never accepted.
  No client identity is used for authorization, and no new staff permission or bypass is added.
- Scoped middleware sets `Cache-Control: no-store` before guards, including 401/400/404 responses.
  The server-rendered reader forwards the existing student cookie and uses `fetch` no-store with
  shared response validation. Failed/malformed responses become an error state, not an empty list.
- Result reads do not write records, transition states, create audits or read immutable snapshots.
  Existing session touching remains the authentication layer's normal Redis behavior.

Academic ownership through registration, examination, program/curriculum and release cohort/date
must be implemented atomically with a future successful publication-read contract. This phase does
not claim these currently unavailable successful-read filters have been implemented; denying every
result is the safe boundary while those contracts are missing.

## Student interface and motion

`/student/results` replaces the planned-module placeholder with My Results, preserving UI-03's
shell, fonts, light surfaces, navy text and existing blue/violet accents. Results navigation is
available, and the dashboard's results link no longer says Soon. No other navigation is redesigned.
The empty state says: “Your results haven't been published yet. They'll appear here when your
university releases them.” API failure has a distinct alert and functional Try again action using
`router.refresh()`. Examination and existing document-library links remain useful, genuine actions.

A scoped optional GSAP entrance moves the already-visible page 4px over 280ms with the incumbent
power3.out ease, reverses on unmount and cancels late imports. Reduced motion skips the import and
movement. Existing Motion navigation indicators and action press feedback are reused; no dependencies
are added. Text is never faded/hidden and no animation delays data. No result-card expansion exists
because no officially released subject list can currently be returned.

Official marksheet downloads are explicitly unavailable; no working download button or provisional
PDF is presented. Existing published historical certificates stay in My Documents and retain their
own independent authorization and authenticity semantics.

## Semester/year and re-exam treatment

Semester-wise and year-wise student contexts both get the same safe empty boundary. No academic
period is inferred, and there is no numeric marks, grade, percentage, pass/fail or GPA display without
a legitimate release. Numeric zero and missing components are exercised as internal staff fixtures
and never become student-visible.

Regular and re-exam attempts are not selected, renumbered, superseded or deleted by this API. Existing
approved application attempt numbers and payment snapshots remain unchanged. The server never picks
the latest/highest marks or releases a payment-pending attempt. Existing re-exam regression coverage
continues to enforce the approved attempt relationship; no new replacement policy is invented.

## Security and regression evidence

New API tests cover anonymous/staff rejection, no-store headers on success/errors, strict pagination
and identity-filter rejection, own/foreign drafts, internal review and approval-only records, review
snapshot denial, indistinguishable 404s, unchanged scoped result/item/event/audit snapshots and absence
of legacy result queries. Internal approval uses only Phase 10D's existing synthetic test-policy
pattern; it never enables publication. No publication bypass or new PUBLISHED fixture is created.
Contract tests reject non-empty/sensitive responses or a publication-enabled state. UI tests cover
empty/error distinction, truthful actions, no fabricated academic metrics/downloads and retry.

Browser coverage exercises both curriculum contexts at 1440px, 768px and 390px, keyboard focus,
drawer Escape/focus restoration, reduced motion, overflow and serious/critical axe checks. A temporary
local test gateway injects a results-only 503 into a separate production web server on port 3101;
all other authenticated reads still use the real synthetic API. Its error screenshot and retry-to-empty
recovery exercise server rendering without adding any application bypass. The gateway/server are
closed after the test. The complete existing suite checks authentication, student/profile/course,
documents, examinations, payments, imports, internal review and disabled publication.

## Verification and preservation

All local repository gates passed:

| Gate                   | Command                                                                | Result                                       |
| ---------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| Format                 | `pnpm format:check`                                                    | Passed                                       |
| Lint/typecheck         | `pnpm turbo run lint typecheck --force --concurrency=2`                | Passed, 27 tasks uncached                    |
| Unit/integration       | `pnpm turbo run test --force --concurrency=1 -- --maxWorkers=1`        | **688 passed**, 14 tasks uncached            |
| Production build       | `pnpm turbo run build --force --concurrency=2`                         | Passed, 10 tasks uncached                    |
| Database drift         | `pnpm db:check`                                                        | **No difference detected**                   |
| Complete browser suite | `pnpm --filter @docversity/web test:e2e` against that production build | **52 passed**, no retries/skips, 6.2 minutes |

Unit/integration totals: API 330, web 98, database 98, imports 94, validation 37, types 20,
worker 7 and storage 4. New coverage adds five API, two web, two validation and two browser tests.

The first full test run encountered a timeout in the existing proxy-trust/rate-limit test
(`test/auth/transport.test.ts`), while all new API tests passed. That file then passed unchanged
in isolation (4 tests, 3.75 seconds); the entire uncached suite passed with one worker. Neither
authentication source, assertions nor timeouts were changed. This is recorded as a local timing
incident, without claiming a proven root cause. The first browser run found an over-broad alert
selector matching Next.js's route announcer as well as the correct rendered error. Scoping it to
`main` retained the complete error/retry assertions; all 52 tests then passed.

The preservation comparison matched **all 38 tables** in the original development database by
row counts and content hashes, and **all 2,224 pre-existing MinIO objects** by key, size and ETag.
The private manifests and environment values remain outside Git. Synthetic tests may add their own
objects; no pre-existing object, academic/payment record, file or backup was removed or replaced.
The existing localhost preview remains running; its ordinary synthetic login effects are described
in the baseline section. No grading, approval/publication, attempt, migration, authentication or
permission implementation was changed.

## Screenshots and design review

All 11 screenshots are genuine production-browser captures with synthetic identities. They are
captured from document top after motion settles and carry embedded origin metadata; provenance
scan found 11 rasters and zero missing origins. No published-result capture is fabricated.
Viewport dimensions are 1440×1000, 768×1024 and 390×844; captures are full-page, so mobile images
can be taller than their original viewport. The existing fixed mobile navigation remains at its
viewport position in those images; the shell reserves bottom padding so lower help text is scrollable.

| Evidence                        | Desktop                                                   | Tablet                                                  | Mobile                                                  | Reduced motion                                                                          |
| ------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Semester-context empty boundary | [1440px](phase-11a/phase11a-results-semester-desktop.png) | [768px](phase-11a/phase11a-results-semester-tablet.png) | [390px](phase-11a/phase11a-results-semester-mobile.png) | [390px, visible keyboard focus](phase-11a/phase11a-results-semester-reduced-motion.png) |
| Year-context empty boundary     | [1440px](phase-11a/phase11a-results-year-desktop.png)     | [768px](phase-11a/phase11a-results-year-tablet.png)     | [390px](phase-11a/phase11a-results-year-mobile.png)     | [390px, visible keyboard focus](phase-11a/phase11a-results-year-reduced-motion.png)     |
| Real API error/retry            | [1440px](phase-11a/phase11a-results-error-desktop.png)    | —                                                       | [390px](phase-11a/phase11a-results-error-mobile.png)    | —                                                                                       |

[Before: unchanged UI-03 Results placeholder at 390px](phase-11a/phase11a-results-before-mobile.png).
Settled screenshots show composition/focus, not animation frame rates; reduced-motion behavior,
keyboard drawer navigation and retry recovery are also exercised in the browser assertions.

The single scoped Impeccable detector run returned **zero findings**. A fresh independent finish
reviewer returned **disposition: ship** for the approved Operate extension, with all 11 captures
valid and no material fixes. Its initial fallback-profile pass was replaced by a full review using the shipped
`impeccable_finish_reviewer.toml` definition in the fresh subagent. No new visual world, design-system rewrite
or comp round was introduced. The independent documenter found no material drift or blocker, preserved the incumbent system
and changed only the stale Results capability sentence in `apps/web/PRODUCT.md`. No `DESIGN.md`
or global system artifacts were created; the pre-existing missing design document was not repaired.
Final SHA
and both GitHub CI links are recorded in the draft PR and delivery response after CI finishes.

## Changed files

22 source/test/documentation files and 11 synthetic screenshots:

```text
apps/api/src/app.module.ts
apps/api/src/student-results/student-results.controller.ts
apps/api/src/student-results/student-results.module.ts
apps/api/test/results/student-results.test.ts
apps/web/PRODUCT.md
apps/web/e2e/student-portal.spec.ts
apps/web/e2e/student-results.spec.ts
apps/web/e2e/student-workspace.spec.ts
apps/web/src/app/student/(portal)/results/page.tsx
apps/web/src/features/student-portal/nav.ts
apps/web/src/features/student-portal/student-overview.tsx
apps/web/src/features/student-portal/student-results-motion.tsx
apps/web/src/features/student-portal/student-results-retry.tsx
apps/web/src/features/student-portal/student-results.tsx
apps/web/src/lib/server-auth.ts
apps/web/test/student-dashboard.test.tsx
apps/web/test/student-results.test.tsx
docs/architecture/frontend-animation.md
docs/development/phase-11a-student-results.md
packages/validation/src/index.ts
packages/validation/src/results/student-results.ts
packages/validation/test/student-results.test.ts
```

## Phase 11B integration requirements

Before any official results or marksheet download can work, approve and implement:

- Publishing actor/scope permissions and durable publication provenance tied to the released marks
  version; internal approval remains separate from public/student release.
- Exact registration/examination/program/curriculum ownership and cohort/date release predicates,
  completeness, withdrawal/correction behavior and consistently non-enumerable detail access.
- Official regular/re-exam attempt selection, archival/supersession and payment eligibility; preserve
  all historic attempts and existing application numbers.
- Authorized numeric component/total display, grade/outcome definitions, and any approved GPA,
  rounding/absence rules. None are calculated in Phase 11A.
- University-approved marksheet template, seals/signatures, reference-number rules, generation and
  signing/storage pipeline, authorized no-store download and current-release revocation semantics.

Successful published-result/subject-list fixtures and screenshots remain intentionally unavailable.
This PR stays draft and unmerged; Phase 11B and Phase 12 are not started.
