# Academic mapping and real-data authorization sheet — 13 November 2026

**Status: HOLD — no real upload, preview, commit or activation distribution is authorized.**
This blank approval sheet accompanies [onboarding acceptance](student-onboarding-acceptance-2026-11-13.md).
Synthetic mentor acceptance does not approve real-data processing. Record signed university decisions
in the institution's private register and enter only its non-personal approval reference here. Do not
put student names, registration numbers, credentials, signatures or the workbook in Git/GitHub/CI.

## Required decisions

All entries below are **PENDING**. A course name, filename, source status or successful test is not
approval. Record the authorized approver, date, decision and evidence privately for every row.

| ID                | Decision requiring university approval                       | Required approved value / private evidence                                                                                                                                                                                                  | Status / approval reference |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| DATA              | Data handling and source authority                           | University data owner; lawful processing authority; approved private university instance/operator; access, retention and recovery arrangements; explicit permission to upload/stage these 58 records                                        | PENDING                     |
| FILE              | Exact private upload copy                                    | SHA-256 `609d6b4f2a4367fda2c04ad092ea751cd3b953b6b2803675ec53ebf94f73699e`; `Registration List`, `A2:M59`; manual inspection including hidden data/comments; revised digest if any identifier is corrected                                  | PENDING                     |
| SESSION           | One academic session for all rows                            | Exact existing UUID, code/name, starts-on/ends-on or explicitly approved null dates, and non-archived status. `2025` is only a proposal                                                                                                     | PENDING                     |
| PROGRAM-A         | Certificate in Ultrasound Technology — 19 registrations      | Exact active program UUID/code, official name, course level, approved duration/unit and owning department                                                                                                                                   | PENDING                     |
| PROGRAM-B         | Certificate in diagnostic Ultrasonography — 39 registrations | Exact active program UUID/code, official name, course level, approved duration/unit and owning department; confirm separate program versus approved alias of A                                                                              | PENDING                     |
| SCHOOL-A          | Docversity India — 56 registrations                          | Decide institution/campus label versus approved department alias; exact active department UUID/code or explicit use of the program's department. Do not infer a new department from the label                                               | PENDING                     |
| SCHOOL-B          | Docversity School of Health Science — 2 registrations        | Exact active department UUID/code and valid relationship to PROGRAM-A                                                                                                                                                                       | PENDING                     |
| INACTIVE-ACADEMIC | Source Inactive — 3 registrations                            | Exact academic status. `SUSPENDED` is proposed, not approved; do not silently drop these rows or default them to ACTIVE                                                                                                                     | PENDING                     |
| INACTIVE-ACCESS   | Account access for the 3 inactive registrations              | Approve or withhold code issuance/activation/login; name responsible operator and any account restriction procedure. SUSPENDED currently permits issuance, activation and login. Academic status alone does not terminate existing sessions | PENDING                     |
| IDENTIFIER-58     | Worksheet row 58 leading-zero warning                        | Exact registration text verified against the authoritative register; keep that text only in the private register/source. Record whether current value is correct or a replacement copy/digest is required; never guess padding              | PENDING                     |
| IDENTIFIER-59     | Worksheet row 59 leading-zero warning                        | Same verification as row 58, independently; private evidence must identify the exact approved value                                                                                                                                         | PENDING                     |
| PERSON            | Registration-to-person linkage                               | Confirm whether 58 registrations represent 58 distinct new people. Imports create one Student per new registration; resolve multi-registration/existing-person cases through approved workflows, never by matching names alone              | PENDING                     |
| FIELDS            | Source columns without import targets                        | Decide handling of Registration Date, Nationality, Course Type and Duration; retain original offline. DOB/photo stay blank for student submission and staff approval                                                                        | PENDING                     |
| STAFF             | Account and distribution authority                           | Approved Super Admin/Registrar/Exam Admin identities and roles, independent credential handling, and identity-checked private activation distribution channel; no real account creation authorized by this PR                               | PENDING                     |

Active → ACTIVE is the existing confirmed field translation. It does not approve the other mappings
or processing gates. Preserve all three inactive records as unresolved until their decisions are signed.

## Relationship sign-off

| Source combination   | Rows | Required relationship confirmation                                         | Status / approval reference |
| -------------------- | ---: | -------------------------------------------------------------------------- | --------------------------- |
| PROGRAM-A × SCHOOL-A |   17 | Approved target program and department are compatible                      | PENDING                     |
| PROGRAM-A × SCHOOL-B |    2 | Both school labels resolve consistently with PROGRAM-A's owning department | PENDING                     |
| PROGRAM-B × SCHOOL-A |   39 | Approved target program and department are compatible                      | PENDING                     |

“No department” in the mapper falls back to a program's department if one exists. It cannot override
a program's department. Imports never create departments, programs or sessions. Do not invent course
structure, duration, subjects or curricula to make a mapping pass.

## Separate release and processing gates

- [ ] **Synthetic mentor gate:** approved isolated synthetic environment; green CI on the exact
      application SHA; pass the Super Admin, Registrar, Exam Admin and student checklist; record findings.
      This permits no real student processing and does not authorize deployment.
- [ ] **University readiness gate:** authorized release/operator; accepted isolation, security and
      verified recovery arrangements; independent approval of any deployment. This chat performs none.
- [ ] **Real preview gate:** DATA, FILE, SESSION, both PROGRAM/SCHOOL mappings, INACTIVE decisions,
      IDENTIFIER-58/59, PERSON, FIELDS and relevant STAFF decisions signed. Record exact file digest,
      mapping version, university instance/operator and explicit upload/staging authorization privately.
- [ ] **Real commit gate:** review all 58 rows, actual actions, warnings, statuses and relationships;
      no unresolved errors or identity ambiguities; verified recovery point; separate written approval
      naming the exact preview job UUID, digest, mapping version, reviewed counts and operator.
- [ ] **Activation gate:** completed reconciliation; separately approved recipients and distribution
      channel; exclude inactive registrations unless INACTIVE-ACCESS permits them. No bulk code issuance
      by import UUID while access policy is unresolved.

Until all applicable gates are complete, **hold all 58 registrations**. A visible Commit button is
not approval: the importer can commit valid rows even if other rows have errors. Do not partially
commit 55 active rows to bypass three unresolved inactive rows. Razorpay live collection stays disabled.

## Authorized-run record (complete privately)

```text
University instance / exact source SHA:
Data handling + mapping approval references:
Approved file digest / mapping version / operator:
Row 58 and row 59 exact-value approval references (values remain private):
Explicit preview authorization reference:
Preview job UUID / valid-warning-error and CREATE-UPDATE-SKIP totals:
Reviewed source statuses: Active 55 / Inactive 3:
Pre-import recovery reference / separate commit authorization:
Final imported-created-updated-skipped-error-pending totals:
Distinct students / cohort status / DOB-photo-account reconciliation:
Activation authorization / inactive access decision:
University reviewer sign-off / date:
```

Use the [authorized preview and reconciliation procedure](student-onboarding-acceptance-2026-11-13.md#clean-university-preview-and-reconciliation-procedure)
for exact field positions, API counters, stop/retry rules and read-only SQL. On a fresh approved target
the conditional expectation is 58 CREATE, 0 UPDATE/SKIP/ERROR, with 55 ACTIVE and 3 approved inactive
statuses; two identifier warnings require explicit resolution. These are expected controls, not actual
university preview results. DOB/photo remain absent before student submission; student counts depend
on approved person linkage. No real preview or import has been performed.
