# Mentor frontend and public verification integration — 15 November 2026

> **Update (PR #41, 17 November 2026):** `/` is the animated hero homepage again (headline, crest, single "Activate your account" action; subtitle and badge row stay removed). The four verification forms remain on their own routes, and `/verify` redirects to `/verify/admission-letter`.

This candidate combines the approved mentor frontend with the reviewed public-verification workstream.
It does not deploy the university application, apply a live migration, activate Razorpay or change
university records/backups. The final candidate SHA, green CI run and verified image identities are
recorded in the integration PR and the final release handoff after commit creation.

## Sources

| Source                                        | Exact revision                             | Review                                                                                         |
| --------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Main, including student activation safeguards | `18468504aa213589606cee7a16187c8ea12d30f8` | PR #38                                                                                         |
| Mentor UI                                     | `490ed226d803012d1f3c318f94de2efa5db1faec` | [PR #39](https://github.com/aryansharma1305/univarsity-doc/pull/39), green CI and AMD64 builds |
| Public verification and staff workflows       | `91e9c59bf8a0624e1da44a39e587b628c7ca1aae` | [PR #37](https://github.com/aryansharma1305/univarsity-doc/pull/37), green CI and AMD64 builds |

Both workstreams remain separate worktrees and PRs. The integrated branch is
`integration/mentor-public-verification-20261115`. The public workstream's backend, database,
permissions, deployment scripts and payment code are unchanged by this integration.

## Conflict resolutions

Five files conflicted when combining the reviewed revisions; no unresolved conflict remains.

| File                                                         | Resolution                                                                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/(public)/verify/admission-letter/page.tsx` | Shared mentor panel plus backend no-index/no-referrer metadata.                                                       |
| `apps/web/src/app/(public)/verify/certificate/page.tsx`      | Shared mentor panel plus backend no-index/no-referrer metadata.                                                       |
| `apps/web/src/app/(public)/verify/registration/page.tsx`     | Shared mentor panel plus backend no-index/no-referrer metadata.                                                       |
| `apps/web/src/app/(public)/results/page.tsx`                 | Shared mentor panel plus backend no-index/no-referrer metadata.                                                       |
| `apps/web/e2e/public.spec.ts`                                | Preserve mentor layout/navigation/auth checks and verify the v2 request contract with clearly isolated browser mocks. |

The legacy v1 API contract test, rate-budget handling, real database lifecycle tests and new staff
workspace cases are retained. The duplicate backend `VerificationScreen` and its overlapping tests
were consolidated into `VerificationPanel` and the shared verification test suite.

## Resulting behavior

- The four pages and homepage keep a single verification input and gold Verify button. The header
  retains only Verify Admission Letter, Verify Certificate, Verify Registration, Check Result and
  Student Sign in. The student sign-in visual keeps only its welcome heading and animated crest.
- Submissions call the existing same-origin v2 API through `studentRequest` and validate its shared
  response contract. Leading zeros are preserved. No API or database contract is invented here.
- The API returns honest unavailable, authentication-required, invalid/no-match, issued/revoked,
  active/inactive and published/unpublished outcomes. Network and rate-limit errors are recoverable;
  older responses cannot replace a later QR check. No fake verification result is generated.
- Public document cards show only schema-approved disclosure fields and masked references.
  Registration and results remain authenticated-owner checks. No DOB, identity documents, private
  PDFs, contact details or full student profiles are exposed by the public panel.
- QR tokens are read from fragments, removed from history before submission and sent only in a JSON
  body. Entering a printed reference replaces the token. The decoded QR credential is never copied
  into source, logs or published evidence.
- Private result filters appear after an authorized result lookup. Period selection continues to
  query the backend, including periods outside a previously returned bounded result list. Empty
  selections retain their controls and disable blank printing. Published-result printing remains
  confined to the authorized print area.

## Validation

- Independent Standards review: zero actionable blockers. Spec review: zero remaining findings after
  fixing empty-period filter recovery.
- Integrated web suite: **160 tests passed**. Focused coverage includes the v2 request shape, leading
  zeros, minimal controls, QR history and replacement, stale responses, rate limits, unavailable and
  no-match states, owner authentication prompts, period recovery and private printing.
- Full production-mode browser suite: **87 tests passed** in 11.9 minutes, including the real backend
  admission/certificate lifecycle, revocation, leading-zero owner isolation, result publication and
  withdrawal, staff maker/checker operations, empty-period recovery, responsive views down to 320px,
  accessibility, reduced motion, existing authentication and student records.
- Build, lint, typecheck and schema drift checks passed. Lint retains only the existing TanStack
  React Compiler warning in `data-table.tsx`.
- Full uncached integrated repository unit/integration gate: **1,154 tests passed** across all packages (5 minutes 44 seconds). A first attempt after the chat pause failed because Docker Desktop was stopped; restarting only the retained local test stack resolved that environment failure.
- Exact integrated-head CI, immutable AMD64 archive validation, staging recovery and two-environment
  load/rollback evidence must be green before the candidate is marked ready.

All automated records and infrastructure are disposable local/CI fixtures. The university and existing
staging databases, object storage and backup directories were not operated on by this integration.
Only unavailable-state captures are committed below; positive lifecycle evidence uses synthetic
fixtures in the automated suite, without committing generated QR credentials.

[Desktop verification](mentor-verification-integration/verification-certificate-1440.png) ·
[Mobile verification](mentor-verification-integration/verification-certificate-320.png)

## Deployment blockers

1. A separate explicit authorization is required for any live replacement or migration. No such
   authorization is included in these PRs or this candidate.
2. `OFFICIAL_VERIFICATION_ENABLED` remains false by default. Legal issuer, permitted disclosure
   fields, policy/issuance/publication authorities and real official records still require university
   approval. Synthetic end-to-end passes do not approve institutional policy or publish real records.
3. Before an authorized rollout, verify a fresh final university database backup, object-storage
   backup custody and restoration evidence, plus the exact candidate image/archive checksums. Existing
   backups must remain retained. Never restore an older backup over newer records.
4. The inherited additive official-verification migration needs an authorized live plan. An older
   application-only downgrade is not claimed safe after new enum values or official publication
   receipts are used; preserve those records and use validated forward recovery where necessary.

Razorpay remains disabled by the existing server-side policy; no environment flag added here enables
live transactions. Existing staff authentication and the student activation fixes from PR #38 remain
part of the candidate.
