# Public verification completion

Implementation follows the provisional design policy supplied on 14 November 2026. The university
has not approved its legal issuing name, public fields, issuance authorities or official records.
No approval is fabricated. No policy, document, result, account or registration is seeded by this
migration. The existing homepage and its exact five header destinations are preserved.

## Authority and privacy

`OFFICIAL_VERIFICATION_ENABLED` defaults to false, including on the existing deployment where it
is absent. An OFFICIAL policy cannot be approved or used while this switch is false. A
SYNTHETIC_ONLY policy is usable only with NODE_ENV=test. Production-mode browser tests enable the
code path only in the disposable local `_e2e` database and use clearly synthetic identities.
Neither a switch alone nor an imported registration authorizes public document disclosure.

Each policy scopes one service to one program, records an authority reference, and requires a
second authorized person to approve immutable proposed rules. Withdrawal takes effect on further
checks. Creating/approving policy records requires `verificationPolicies.manage`, granted only by
SUPER_ADMIN's existing catch-all. This is a restrictive engineering permission, not confirmation
of the university's proposed operational roles. Existing staff permissions remain authoritative.

Public fields are limited to status, document type, approved institution, an optionally disclosed
program/issue date, and a masked document reference. Full names, DOB, photos, addresses, contact
information, student IDs, private PDFs and audit details are excluded. Registration and results
require the existing authenticated student session and exact own registration number. Reference
strings preserve leading zeros; a number alone cannot create a session or activate an account.

The shared Redis limiter runs before request validation and combines a client and global budget.
A second keyed-reference budget limits distributed guesses. Audit events contain keyed reference
and client hashes, never raw numbers or QR tokens. Redis/audit failures fail closed. Responses are
not cached. The legacy v1 verification API remains unavailable for backward compatibility;
functional screens use the strict v2 contract. QR tokens are 256-bit opaque random credentials in
URL fragments, never verification URLs fetched by the API. The page removes the fragment from
history and submits it only in a JSON body after user action.

## Official document workflow

The existing `Certificate`, `CertificateTemplate`, `ProgramDocumentTemplate` and certificate request
tables remain authoritative. Admission letters add a document type to this same credential store;
student imports do not create credentials. Existing sample renderers and synthetic issuance are
unchanged and never become official authority.

1. Propose and independently approve a service/program policy through `verification-policies`.
2. Prepare a template version with `POST official-documents/templates`; a separate person activates
   it with `POST official-documents/templates/:id/approve`. Activation updates default routing;
   existing issued documents retain their immutable template and snapshot.
3. `POST official-documents` accepts multipart `metadata` (the shared
   `prepareOfficialDocumentSchema` serialized as JSON) and a static PDF up to 10 MB. The university
   supplies the actual approved document; sample preview generation is not official rendering.
   Certificates require a matching REVIEW_COMPLETED request. Admission letters instead require
   explicit issuing authority and never arise automatically from a registration.
4. Authorized staff can inspect the private upload at `GET official-documents/:id/file`.
5. A second person approves the record, then an authorized issuer issues it. Both operations
   recheck authority, request provenance, template and registration. Issuance checks the stored
   PDF hash and assigns a random QR token. Certificates and admission letters remain private PDFs.
6. Revocation is audited, requires a reason, preserves history and immediately prevents owner
   download. Public lookup distinguishes approved issuance, revocation and no issued match.

Staff writes use the existing certificate generation/approval/issue/revoke permissions, staff
sessions and CSRF controls. Draft, unapproved and legacy synthetic snapshots are excluded from
v2 public checks. The owner-only document list/download is integrated with My Documents; staff
sessions cannot substitute for a student session. PDF bytes are checked against their issued hash.

University application eligibility, evidence, fee and review rules remain pending. The pre-existing
certificate application policy is still test-only and is not converted into a live exemption.
The issuance API can consume a duly reviewed request once those upstream rules are authorized.
This dependency must be resolved before claiming end-to-end official certificate operations.

## Result workflow

`official-results/:id/attest` records university-supplied outcomes, totals and subject decisions in
a DRAFT result under current program authority. It does not invent a grading algorithm. Existing
draft validation, provenance auditing, submission, independent review and immutable review
receipts are reused. A marks author or submitter cannot approve their work.

`official-results/:id/publish` requires the exact approved version, official attestation, complete
subject outcomes, unchanged submission/approval snapshots and a current approved result policy.
An immutable `ResultPublication` receipt authorizes the narrowly scoped database transition from
APPROVED to PUBLISHED. Existing published-mark immutability remains in force. Withdrawal changes
only availability and never rewrites marks. Correction requires the existing new-revision workflow.

Both student results and Check Result expose only owner-scoped approved publications. Period and
examination selection filter published records; no published record is distinguished from service
unavailability. Printing exposes only the marked, authorized published-result area. Missing marks,
grades or GPA remain missing rather than being called withheld, absent, zero or failed.

## Migration and deployment boundary

`20261114090000_official_verification` is additive: a document enum value, authority/publication
receipt tables, constraints and a constrained extension to the existing result transition guard.
It neither resets nor imports the university database. Existing synthetic workflows remain separate.

Read-only Hostinger inspection confirmed release source main `2efcea18334a30aa226f9379f4e238320f0b5735`
and the existing university Compose project. Aggregate university counts on 14 November: zero
registrations, zero certificates, zero published results, 22 completed migrations. The expected
58 registrations had not been imported. All five public destinations responded; four were still
placeholders at baseline. Payment activation remains deferred.

A real database backup was streamed to a private directory outside Git, restored into an isolated
local PostgreSQL database, upgraded with the new migration and checked for Prisma drift. Backup
size: 356,012 bytes; SHA-256: `16d81ece4ec9df04da5881156886917a297b71742077aac6f9258a0322d5b949`.
This verifies a database recovery rehearsal, not object-storage backup custody or approval to deploy.
Live replacement/migration still requires explicit user authorization, reviewed green CI, immutable
AMD64 images, a fresh final backup check and post-deployment acceptance. Do not build on the VPS.

## Verification and acceptance

Tests use disposable synthetic databases and the private test object-storage bucket. Coverage
includes policy maker/checker control, draft exclusion, issued/revoked credentials, QR integrity,
leading zeros, owner isolation, audit failure, rate limits, reviewed publication/withdrawal,
responsive forms, accessibility and print visibility. Existing student activation, password,
profile approval and staff/student isolation suites remain required regression checks.

| Homepage function       | UI                                             | Backend / real DB                                                                        | Authority                                                          | Automated acceptance                                             | Live acceptance                                       | Remaining dependency                                                   |
| ----------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Verify Admission Letter | Functional number/QR form                      | Existing credential table; explicit preparation, template approval, issuance, revocation | Approved scoped policy + independently approved document           | Synthetic integration/browser lifecycle                          | Pending deployment + official records                 | Legal issuer, fields, authorities, approved admission PDFs             |
| Verify Certificate      | Functional number/QR form                      | Existing request/template/credential records; private owner downloads                    | Reviewed request + approved policy/template/document               | Synthetic integration/browser lifecycle                          | Pending deployment + official records                 | Upstream application/review policy and approved official certificates  |
| Verify Registration     | Functional exact-identifier form               | Own authorized StudentRegistration query                                                 | Student authentication + approved scoped policy                    | Synthetic leading-zero, active/inactive and isolation checks     | Pending deployment + approved import                  | Approval/import of the 58 registrations and disclosure policy          |
| Check Result            | Functional period/examination lookup and print | Existing drafts/review/results + publication receipt                                     | Authenticated owner + attested, independently reviewed publication | Synthetic publication, withdrawal, ownership and print checks    | Pending deployment + official publications            | University-supplied outcomes/grades, authorities and published results |
| Student Sign in         | Existing flow retained                         | Existing activation/password/session/dashboard/profile/documents/results systems         | Existing individual activation and ownership guards                | Existing regression suite; new owner-result/document integration | Baseline route responds; full live acceptance pending | Approved imported students, account activation and profile approval    |

Synthetic passes do not make any row fully operational on Hostinger. The exact CI/image evidence
and final test counts belong in the PR/release handover; live acceptance remains explicitly pending.
