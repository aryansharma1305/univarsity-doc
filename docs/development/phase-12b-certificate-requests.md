# Phase 12B — certificate applications and staff review

## Baseline audit

Dedicated branch/worktree `feature/phase-12b-certificate-requests` from green main
`9ca8854c87ccaea9231feb063d407763cc1669aa`. Phase 12A PR #18 merged; post-merge
[CI passed](https://github.com/aryansharma1305/univarsity-doc/actions/runs/38339992244).
Read CLAUDE.md, Phase 12A/11B reports, authentication/CSRF/RBAC/audit infrastructure,
Prisma certificate and historical-document models, profile requests, Phase 9B applications
and Phase 9C reconciliation. Existing worktrees and their changes were preserved; no open PRs
were present at baseline. The user's current localhost app remains separate.

The authoritative `Certificate` model represents credentials. Historical documents are separate
private evidence, with their own publication/replacement lifecycle. Neither is an application table.
Profile requests demonstrate transactional audits and private ownership; re-exam applications provide
unique open requests and payment/application separation. This feature reuses those conventions,
existing Redis rate limiting, Zod/API clients, UI-02/UI-03 tokens and installed Motion utilities.
No new dependency or notification provider was added.

## Policies and unavailable services

The catalogue contains TRANSCRIPT, PROVISIONAL, CHARACTER and MIGRATION. TRAINING_CERTIFICATE remains
Phase 12A's synthetic template preview and is not offered for applications. All real services are
unavailable initially: no authoritative university application or completion policy was provided.

A complete application policy requires an immutable identifier/version, certificate type, explicit
approval and authority reference, eligibility evaluator/reference, field requirements, evidence
requirements and their authority, approved fee/exemption authority, and allowlisted actions.
Unknown, incomplete or unsupported policies fail closed. The only implemented eligibility evaluator
is `SYNTHETIC_TEST_ONLY`, and is accepted only when the API configuration is `NODE_ENV=test`.
Production/development policy definitions are empty. There is no environment switch, policy editor,
seed or public endpoint that enables applications. Future real eligibility or fee support requires
an approved evaluator/integration and a reviewed implementation; an enabled toggle is insufficient.

Tests deliberately supply a complete synthetic no-evidence/fee-exemption policy through isolated
service mocks. Those fixtures are not deployed. Browser tests seed one synthetic _existing request_
only in the disposable `_e2e` database, without activating any policy. Response/submission forms are
exercised in component tests; the full policy-enabled lifecycle is exercised against PostgreSQL in
API tests. Browser screenshots accurately show policy-unavailable actions.

Staff completion requires a separately validated review policy (authority, approved action and
certificate-type scope); only isolated tests supply one. No live review completion is enabled.

## Additive data model and compatibility

Two tables: `certificate_requests` and `certificate_request_events`. Requests reference the existing
student, store a unique human reference, immutable submitted fields and approved policy snapshot,
submission time, idempotency key and monotonically increasing version. Foreign keys restrict deletion.
No registration ID is accepted from the client; identity comes solely from the authenticated student.
No arbitrary registration is selected or assumed eligible. Multi-registration eligibility must be
implemented explicitly when the university supplies a real policy.

Migrations `20261019090000_certificate_requests` and
`20261019093000_certificate_request_event_bounds` add tables, indexes and integrity triggers.
No previous migration is changed; no existing certificate/student/payment row is rewritten.
Prisma's relation additions are virtual back-relations, not changes to existing domain columns.
One partial unique index prevents a second open request per student/type, including reviewed requests
awaiting future approval. The predicate uses PostgreSQL's normalized expression for drift stability.

History is append-only: UPDATE/DELETE/TRUNCATE are blocked. Request deletion/truncation is blocked,
submitted snapshots are immutable, state/version transitions are constrained, actors must match
student ownership, and event actions must match their resulting state and required message fields.
A deferred constraint requires a matching event before each transition can commit.

Compatibility: old code can operate with the additive schema. Rollback reverts the feature and leaves
request/history data intact; dropping these tables is a separate, reviewed operation, never automatic.
The migration was applied to an isolated copy of the original database and verified against hashes
of all 37 original domain tables. The migration-history table changes only in that copy. The first
copy attempt stopped because local pg_dump 16 cannot dump PostgreSQL 17; container-native tooling
completed the copy without modifying the original database. Private copies/dumps are not committed.

## State transitions

| Actor                                            | Action                | Source                                          | Target                |
| ------------------------------------------------ | --------------------- | ----------------------------------------------- | --------------------- |
| Student with complete application policy         | Submit                | New                                             | SUBMITTED             |
| Authorized staff                                 | Record private review | SUBMITTED / UNDER_REVIEW / INFORMATION_PROVIDED | UNDER_REVIEW          |
| Authorized staff                                 | Request information   | SUBMITTED / UNDER_REVIEW / INFORMATION_PROVIDED | INFORMATION_REQUESTED |
| Owning student with current response policy      | Respond               | INFORMATION_REQUESTED                           | INFORMATION_PROVIDED  |
| Owning student with current cancellation policy  | Cancel                | Any active pre-completion state                 | CANCELLED             |
| Authorized staff with separate completion policy | Complete review       | UNDER_REVIEW / INFORMATION_PROVIDED             | REVIEW_COMPLETED      |
| Authorized staff                                 | Close                 | REVIEW_COMPLETED / CANCELLED                    | CLOSED                |

There are no unused draft states, approval states or issuance transitions. Closed requests cannot
reopen. Concurrent transitions use conditional status/version updates inside one transaction;
one wins and stale attempts receive 409. Submission keys replay identical input without extra
history/audits, reject changed input, and coexist with the database's open-request constraint.
Audit failures roll back the request/event mutation. Audit metadata contains IDs/codes/versions,
never purposes, responses or private notes.

## Ownership, permissions and API

Dedicated `certificateRequests.read` and `certificateRequests.review` permissions are granted only
to SUPER_ADMIN and CERTIFICATE_ADMIN through the existing code-defined role map. Existing staff
roles are not reassigned or automatically promoted. REGISTRAR, EXAM_ADMIN, APPROVER and VIEWER do
not gain access. User role assignment remains the existing explicit administrative process.
These permissions confer no Rector, issuance, payment-verification or document-publication authority.

Student endpoints (student session/ownership on every request):

- GET `/api/v1/student/certificate-services`
- GET `/api/v1/student/certificate-requests` and `/:id`
- POST `/api/v1/student/certificate-requests` (complete approved policy required)
- POST `/api/v1/student/certificate-requests/:id/respond` and `/cancel`

Staff endpoints (dedicated permission guards):

- GET `/api/v1/certificate-requests` and `/:id`
- POST `/:id/request-information`, `/record-review`, `/complete-review`, `/close`

All mutation bodies are strict shared Zod contracts, with expected versions for transitions.
Unknown identities, staff fields, paid/approved/issued flags, object paths and unsupported types
are rejected. Global CSRF/origin guards remain authoritative. Writes are limited to 30 per minute
per authenticated principal with existing fail-closed Redis counters. Pagination is capped at 50;
search is staff-only and restricted to reference/name/registration fields. Counts use authorized
server scope. Student responses omit staff identity, private notes and internal-only review events.
Sensitive API responses, including denials, have `Cache-Control: no-store`.

## UI, accessibility and motion

The user confirmed mobile-first UI-03 cards/timelines and UI-02 queue/detail patterns. No visual
identity replacement or raster asset was introduced. Student catalogue/history/details live at
`/student/certificate-requests`; staff queue/details at `/admin/certificate-requests`.
The new student route has a scoped existing QueryProvider, leaving other student flows untouched.
Navigation joins existing shells; staff entries are permission-gated. Application forms present a
summary before submission and preserve a submission key for retry. Public information requests and
private staff notes have separate labels. Dialogs restore focus to their trigger and retain typed
input after errors. Existing Motion tap feedback respects reduced motion; no new animation library.
There are no fabricated processing times, fees, approval stages or counts.

Screenshots use synthetic browser fixtures at 1440px, 768px and 390px and include catalogue/history,
detail timelines, staff queue/detail, information dialog, policy-unavailable follow-up, denied access
and reduced motion. Independent visual review and the final verification evidence are recorded below.

## Finance, corrections, Rector and delivery boundaries

Payment status, Rector approval and issuance are returned as separate `NOT_AVAILABLE` fields.
No payment destination, upload, fee collection, Finance verification, signing, QR token generation,
PDF generation for students, MinIO access or certificate mutation is connected to this module.
Phase 9C reconciliation remains unchanged and is a future integration seam, not a reused payment
shortcut. INR 3,000 is a quoted future correction fee, not an activated collectible charge.

Correction requests are explicitly unavailable: legacy historical evidence is insufficient to
prove an authorized issued-certificate identity/eligibility link. No speculative correction table,
field-change payload or document replacement was added. Preserve original issued/historical records.
Future correction integration must link an authorized Certificate, validate changed fields and
Finance evidence, and retain the original document and history.

Future chain: approved application/eligibility → separately authorized staff review → verified
Finance requirements → explicitly authorized Rector decision → controlled issuance/signing/storage
→ secure student delivery → separately approved public verification. No shortcut is enabled here.
Existing in-app request history is the notification channel; no email/SMS delivery is claimed.

## Verification evidence

Full uncached verification used Node 22 and isolated Phase 12B databases. Format, lint, typecheck,
production build and database drift passed. Unit/integration tests: **763 passed**, zero cached tasks:
98 database, 41 validation, 20 types, 4 storage, 30 documents, 94 imports, 7 worker, 112 web and 357 API.
Dedicated additions: 4 validation, 6 web and 15 API tests, plus 3 browser scenarios.
Complete browser suite: **59 passed**, zero retries/skips in the successful run (9.6 minutes).
It covers the existing public, student, authentication, academic, historical-document and payment
workflows, with published-only result boundaries unchanged. A targeted rerun verifies the final
additional scrolled screenshot capture; it changes evidence capture only, not workflow assertions.

Focused API tests cover ownership, duplicate races, concurrent transitions, transactional audit
failure, DB history guards, policy completeness, private-note filtering, CSRF, unsupported
payment/approval/issuance and rate limits. Browser tests exercise actual API-backed catalogue,
queue/history/information requests, ownership, permission denials including the mobile drawer,
keyboard/dialog focus, axe checks, responsive layouts and reduced motion. Enabled application and
response policies remain isolated to API/component tests, not live browser configuration.

Verification history is retained rather than hidden: two unchanged database tests initially timed
out during host load, then passed unchanged in a 22-test isolated rerun and the complete 763-test
run. Earlier browser attempts encountered proxy resets, test/startup timeouts and repeated Mac sleep
periods confirmed by its power log. No existing timeout or safety assertion was relaxed. The new
navigation assertion initially counted a disabled current-page breadcrumb as a link; it now checks
actual navigation links and the unauthorized mobile drawer. Extra scrolled viewport evidence avoids
mistaking fixed bottom-navigation overlays in full-page captures for content loss.

Fresh independent review: **disposition: ship**, covering the 16 captured surfaces and current
unavailable-policy release, not future policy activation or enabled-form visual approval.
[Visual review](phase-12b-visual-review.md) and
[incumbent design comparison](phase-12b-design-comparison.md) preserve the confirmed UI-02/UI-03 system.
Existing missing DESIGN.md/sidecar and stale PRODUCT context were reported without unrelated repair.

Screenshot evidence (all synthetic):

| Surface                            | Evidence                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student catalogue, 1440px          | [Desktop](phase-12b/phase12b-student-desktop.png)                                                                                                                         |
| Student catalogue, 768px           | [Viewport](phase-12b/phase12b-student-tablet-viewport.png), [full page](phase-12b/phase12b-student-tablet.png)                                                            |
| Student catalogue, 390px           | [Viewport](phase-12b/phase12b-student-mobile-viewport.png), [full page](phase-12b/phase12b-student-mobile.png)                                                            |
| Student mobile navigation          | [Drawer](phase-12b/phase12b-student-drawer.png)                                                                                                                           |
| Student detail, reduced motion     | [390px detail](phase-12b/phase12b-student-detail-reduced-motion.png)                                                                                                      |
| Student information request        | [Scrolled viewport](phase-12b/phase12b-student-information-viewport.png), [full page with disabled follow-up](phase-12b/phase12b-student-information-policy-disabled.png) |
| Staff queue                        | [1440px](phase-12b/phase12b-staff-queue.png), [768px](phase-12b/phase12b-staff-queue-tablet.png), [390px](phase-12b/phase12b-staff-queue-mobile.png)                      |
| Staff details                      | [1440px](phase-12b/phase12b-staff-detail.png), [390px](phase-12b/phase12b-staff-detail-mobile.png)                                                                        |
| Public message/private note dialog | [Information dialog](phase-12b/phase12b-information-dialog.png)                                                                                                           |
| Permission denial                  | [390px forbidden](phase-12b/phase12b-forbidden.png)                                                                                                                       |

Protected baseline verification: **38 original tables and 2,905 original MinIO objects preserved**
(keys/sizes/ETags, table counts and content hashes). Both additive migrations passed against an
isolated original-database copy, with all 37 original domain tables unchanged. No original reset,
reseed, migration or object replacement occurred. Existing localhost:3000 remains HTTP 200.

[ADR-0017](../decisions/ADR-0017-policy-gated-certificate-requests.md) records policy/state boundaries.
The required code graph was refreshed with `graphify update .`: 6,627 nodes, 17,607 edges,
245 communities; only the three documented graph outputs are included. It is a navigation aid and
may lag small final edits, as permitted by the repository graph policy.

Final-SHA push and pull-request CI links are recorded in the draft PR verification section after
commit. The phase ends at a draft PR awaiting manual merge approval; no Phase 12C/13 work.
