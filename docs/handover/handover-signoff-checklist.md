# Handover sign-off checklist

- **Audience:** university signatories, the project mentor, the production operator.
- **Scope:** the actions the university owns, the sign-offs needed before each capability is used for
  real records, and the operator's ongoing responsibilities. Record evidence by reference (document
  number, date, ticket), never by pasting personal data or credentials.
- **Applies to release `916b07c`.**

## A. University-owned decisions and sign-offs

| #    | Item                                                                                                                                                    | Who signs (to be named by the university) | Evidence to record                                    | Done |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- | ---- |
| A-1  | Role model: confirm `ROLE_PERMISSIONS` ([staff-roles-and-permissions.md](staff-roles-and-permissions.md)) or request changes                            | Registrar + management                    | Signed decision reference, date                       | [ ]  |
| A-2  | Named holder of every staff account and role, including both Super Admin accounts ("Admin2")                                                            | Management                                | Account list held privately; decision reference       | [ ]  |
| A-3  | Staff MFA requirement (`STAFF_MFA_ENFORCED`) and staff recovery procedure                                                                               | IT/security contact                       | Decision reference                                    | [ ]  |
| A-4  | Result review/approval roles (ADR-0016) and the `result` policy per course                                                                              | Controller of Examinations                | Decision reference; approved policy IDs               | [ ]  |
| A-5  | Regular examination application rules                                                                                                                   | Controller of Examinations                | Decision reference                                    | [ ]  |
| A-6  | Course certificate sets and the eligibility approval authority (ADR-0018)                                                                               | Registrar + management                    | Decision reference                                    | [ ]  |
| A-7  | Confirm or amend the Migration > 24-month rule; note CDS, CUSG, CUT do not qualify                                                                      | Registrar + management                    | Decision reference                                    | [ ]  |
| A-8  | Course Completion application policy (eligibility, template, signatory)                                                                                 | Registrar                                 | Decision reference                                    | [ ]  |
| A-9  | Certificate application policies (eligibility, evidence, fee exemption, review authority) per course and type                                           | Registrar + Finance                       | Decision reference per course/type                    | [ ]  |
| A-10 | Written public-verification authorization per service and course: reference, date, signatory, legal institution name, courses, fields, QR-holder access | Authorized signatory                      | Copy of the signed letter; policy IDs created from it | [ ]  |
| A-11 | Official document templates and signatories; who uploads the final PDFs                                                                                 | Registrar                                 | Template approval reference                           | [ ]  |
| A-12 | Roll numbers for registrations without one (Check Result)                                                                                               | Registrar                                 | Import job ID or change record                        | [ ]  |
| A-13 | Retention periods (uploads, workbooks, scans, superseded originals, backups)                                                                            | Legal/privacy contact                     | Policy reference                                      | [ ]  |
| A-14 | Re-exam fee rules and payment destinations per region                                                                                                   | Finance                                   | Approved fee rule and destination version IDs         | [ ]  |
| A-15 | Schools level above departments (needed or not)                                                                                                         | Management                                | Decision reference                                    | [ ]  |
| A-16 | Email/SMS delivery and online payments: deferred or required                                                                                            | Management                                | Decision reference                                    | [ ]  |
| A-17 | Backup RPO/RTO, retention, off-server location, second custodian (D3), alert recipients (D2)                                                            | IT contact + operator                     | Decision references                                   | [ ]  |
| A-18 | UAT completed for each role ([functional-acceptance-test-matrix.md](functional-acceptance-test-matrix.md))                                              | Each role's lead                          | UAT record: case IDs, pass/fail, dates                | [ ]  |
| A-19 | Acceptance of this handover documentation                                                                                                               | Project mentor                            | Signed acceptance, date                               | [ ]  |

## B. Before enabling public disclosure (per service and course)

- [ ] A-2, A-10 signed.
- [ ] Operator: `dv-flag-check.sh` shows the intended `OFFICIAL_VERIFICATION_ENABLED` value (not
      `UNKNOWN`); `dv-disclosure-inventory.sh` "before" output saved.
- [ ] Policy proposed by one Super Admin and approved by the other, exactly as authorized.
- [ ] Post-activation test plan passed and recorded
      ([public-verification-and-qr-activation-guide.md](public-verification-and-qr-activation-guide.md#8-post-activation-test-plan)).

## C. Operator responsibilities (ongoing)

| Responsibility                                                                                            | Evidence                                                                    |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Run releases with the prep script and release wrapper personally (sudo), in approved windows only         | Private release record: `<release>`, `<sha>`, image IDs, backup ID, results |
| Keep rollback image-only; never reverse migrations or restore over newer data without an approved cutover | Release record                                                              |
| Keep one unique Compose snapshot per release                                                              | File list in release record                                                 |
| Daily backup check; weekly off-server verification and pruning; periodic isolated restore test            | Backup log entries                                                          |
| Watch alerts and heartbeat; respond to unhealthy services, disk, TLS expiry                               | Alert history                                                               |
| Change `OFFICIAL_VERIFICATION_ENABLED` only on a written university instruction; restart API; re-check    | Instruction reference; `dv-flag-check.sh` output                            |
| Create staff accounts only for approved holders (CLI until PR #61 is released); disable leavers           | Account change log (no passwords)                                           |
| Confirm which ops-kit items (backup timer, encryption, alerting, SSH hardening, custody) are applied      | Per-item confirmation with date                                             |
| Never print, paste or commit secrets, student data, passwords, QR credentials or staff emails             | —                                                                           |

## D. Pending releases

Before releasing PRs #60–#63: review, CI on the exact SHA, prep-script migration rehearsal (#62, #63
add migrations) and a release record. #63 does not make Migration certificates available for any
current course (A-7).
