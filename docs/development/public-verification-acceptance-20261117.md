# Public verification acceptance — 17 November 2026

Local, synthetic acceptance of admission letters, certificates, registration verification, results
publication and the public/owner lookups at `origin/main` `e123e35`. Everything ran against an
isolated Compose project with disposable `_api_test`/`_e2e` databases and the test bucket. No
production system, real record or university decision was used, and nothing here approves an
institutional policy.

## How to reproduce

- API: `apps/api/test/public-verification/acceptance.test.ts`. It runs two application instances
  against the same test database: `OFFICIAL_VERIFICATION_ENABLED=true` and `false`. It uses
  `NODE_ENV=development` and an `OFFICIAL` (not `SYNTHETIC_ONLY`) policy definition. It creates
  every record through the staff and student APIs; the database is read only to observe state, plus
  two negative integrity probes. Each `it` (A1–A17, plus A10b) is one acceptance step.
- Browser: `apps/web/e2e/public-verification-acceptance.spec.ts`. It covers issued, revoked,
  registration and published-result states at 1440, 768, 390 and 320 px (overflow and axe), plus the
  print view of published results. Its QR step opens an admission-letter QR link only; certificate QR
  links are covered by the API test, not the browser. Accounts are role-separated.

## Acceptance matrix

| Flow                                                      | Outcome      | Evidence                                                                                                                                                                               |
| --------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Policy proposal → independent approval                    | PASS         | A3. Only `verificationPolicies.manage` (SUPER_ADMIN) can propose or approve. Approving your own proposal returns 403.                                                                  |
| Admission letter: prepare → approve → issue → lookup      | PASS         | A4. Unissued (PENDING_APPROVAL/APPROVED) returns NOT_FOUND. ISSUED returns VALID with institution, program, issue date and a masked number. No name is disclosed.                      |
| Admission letter generation (PDF rendering, bulk)         | MISSING      | Only a university-supplied static PDF upload exists (`official-documents.service.ts` `prepare`). `packages/documents/src/future-issuance.ts` is architecture only.                     |
| Certificate: request → review → prepare → approve → issue | PASS         | A5. Preparing without a REVIEW_COMPLETED request returns 409.                                                                                                                          |
| Certificate QR (fragment, 43-char token)                  | PASS         | A5–A6 (API). The e2e spec opens an admission-letter QR only. Wrong-service tokens return NOT_FOUND, malformed 400, owner-only services INVALID.                                        |
| Certificate revocation                                    | PASS         | A15. Revoking without a reason returns 409, not 400. Number and QR lookups return REVOKED and the reason is not disclosed. The owner download is withdrawn and revocation is terminal. |
| Certificate re-issue / supersede / correction             | MISSING      | No endpoint sets `SUPERSEDED`, although the lookup handles it (`official-verification.service.ts:138`). Certificate numbers are unique.                                                |
| Registration verification (owner only)                    | PASS         | A9. Anonymous users and staff get AUTHENTICATION_REQUIRED. Another student gets the same INVALID as an unknown number. Leading zeros are significant.                                  |
| Registration verification by third parties                | POLICY-GATED | `identityFactor: z.literal('AUTHENTICATED_OWNER')` means there is no public registration lookup by design.                                                                             |
| Results: attest → submit → approve → publish (receipt)    | PASS         | A10 and A10b. A SUPER_ADMIN attester or submitter is refused on approve (403). An immutable `result_publications` receipt is stored, with policy, publisher and digest.                |
| Results approval by an operational role                   | POLICY-GATED | `results.approve`/`results.review` are granted to no role except SUPER_ADMIN (`packages/types/src/permissions.ts`). In A10, APPROVER and EXAM_ADMIN get 403.                           |
| Results owner lookup, published vs unpublished            | PASS         | A11 and A16. Another student gets INVALID and anonymous users get AUTHENTICATION_REQUIRED. Withdrawal returns UNPUBLISHED.                                                             |
| Result re-publication after withdrawal                    | MISSING      | A16: publish → 409. WITHHELD cannot return to APPROVED, and `result_publications.result_id` is UNIQUE. A revision workflow is required.                                                |
| Owner document list/download                              | PASS         | A8. The owner receives the exact bytes with `no-store` and as an attachment. Other students get 404. Anonymous users and staff sessions get 401.                                       |
| `OFFICIAL_VERIFICATION_ENABLED=false`                     | PASS         | A12. The same issued records return UNAVAILABLE. OFFICIAL policy approval returns 403. Owner list and download are empty or 404.                                                       |
| Malformed/empty input                                     | PASS         | A13. Fourteen malformed bodies return 400 with no echo. Query parameters and form posts return 400. Unknown services or methods return 404.                                            |
| Rate limits (429 + Retry-After)                           | PASS         | A14. The 21st request from a client returns 429 with `Retry-After`. Invalid bodies count toward the limit. The 11th check of the same reference returns 429.                           |
| Responsive 1440/768/390/320 and print                     | PASS (fixed) | E2E acceptance spec. Before the fix, the published-results table at 320 px failed axe `scrollable-region-focusable` (see below).                                                       |

## Findings

1. **Accessibility (fixed in a separate commit).** In
   `apps/web/src/features/public-verification/verification-panel.tsx`, the results table wrapper
   (`div.mt-5.overflow-x-auto`) scrolls horizontally at 320 px. Keyboard users could not reach the
   overflow (WCAG 2.1.1). The fix applies the existing `packages/ui` `Table` pattern:
   `role="region"`, an `aria-label` unique per result (examination, period and attempt) and
   `tabIndex={0}`.
2. **Completed registrations are reported as inactive or suspended.** In
   `apps/api/src/public-verification/official-verification.service.ts` (registration branch),
   `status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'` with the message "This registration is inactive or
   suspended." also applies to `COMPLETED` (graduated) registrations; see A17. Proposed fix, which
   needs a university decision on wording: add a `COMPLETED` response status (a contract change), or
   use a neutral INACTIVE message such as "This registration is not currently active."
   **Resolved (public verification portal, 2026-11-22):** the response now carries `recordStatus`
   (ACTIVE, COMPLETED, SUSPENDED or REVOKED) and status-aware wording for both the owner and the
   anonymous path; only ACTIVE is ever described as active. A17 asserts each status.
3. **Document numbers are case-sensitive; registration numbers are not.** The certificate lookup
   uses `certificateNumber: input.reference` exactly, while the reference budget key and registration
   lookup upper-case the input (A7). A lowercase entry of a printed number returns NOT_FOUND. Either
   document this or compare a normalised form. This is a decision for the university.
4. **Revocation without a reason returns 409 CONFLICT.** It should be 400. The reason is optional in
   `officialDocumentCommandSchema` and enforced in the service. A dedicated revoke schema with a
   required `reason` would return a validation error.
5. **There is no publisher ≠ approver check for results.** This is a policy question, not a defect.
   Only approver ≠ submitter, attester and marks author are enforced.
6. **The e2e rate-limit budget is shared across specs.** Within one Playwright run, specs share the
   20-per-minute client budget. On a 429 the new spec waits for the response's `Retry-After` plus one
   second and retries once (a recoverable state) rather than flaking.

## Institutional inputs required before real records are public

- **Issuer identity:** the legal `institutionName` and an `authorizationReference` for each service and
  program policy.
- **Disclosure fields:** whether program and issue date are disclosed (`discloseProgram`,
  `discloseIssueDate`). Also how completed or suspended registrations should be worded publicly, and
  whether document numbers are case-insensitive.
- **Named people for each role:** policy proposer and approver (currently only SUPER_ADMIN),
  template/document preparer, approver, issuer and revoker, result attester, reviewer/approver
  (`results.approve` is currently held by no operational role) and publisher. Also whether the
  publisher must differ from the approver.
- **Certificate application rules:** eligibility, evidence, fee or exemption authority and review
  authority (the policy's `application` block).
- **Real records:** approved admission letter and certificate PDFs and numbers, attested result
  outcomes and grades, and approval to import and activate the registrations.
- **Policies still to decide:** result withdrawal and correction, re-publication, re-issue and
  supersession, and the revocation reason vocabulary.
- **Switch:** explicit authorisation to set `OFFICIAL_VERIFICATION_ENABLED=true` on a deployment.
