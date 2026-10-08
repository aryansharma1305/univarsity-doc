# Requirements (updated 2026-10-08)

Confirmed by the university on top of the original plan ([product decisions](../architecture/product-decisions.md)).
Status column: ✅ built · 🟡 partly · ⏳ planned (see [roadmap](../roadmap.md)).

| #   | Requirement                                                                                                       | Notes                                                                                     | Status            |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------- |
| A1  | Import existing student registrations **without** date of birth or photo                                          | DOB/photo optional; empty columns produce no warnings                                     | ✅ Phase 5        |
| A2  | Students submit missing DOB and photo later, with admin review                                                    | Change requests kept apart from records until approved                                    | ⏳                |
| B1  | Upload historic (physically/digitally issued) certificates as image/PDF and attach them to the right registration | Evidence of a historical document — **not** a trusted digital credential                  | ⏳                |
| B2  | Show them in the student's document library                                                                       | Only after authorised review/reconciliation, per visibility rules                         | ⏳                |
| B3  | Preserve existing certificate numbers and QR references                                                           | `legacy_mappings` already exists for old QR/identifiers                                   | ⏳                |
| B4  | Never declare uploaded documents valid automatically                                                              | Authenticity status set only by authorised staff                                          | ⏳                |
| C1  | Separate student portal: activate account, set own password, sign in                                              | Separate authentication boundary; no staff permissions ever                               | ⏳                |
| C2  | Activation must prove ownership of an imported registration; **registration number alone is never enough**        | Initial method: university-issued single-use activation codes; verified email/phone later | ⏳                |
| C3  | Students access only their own records                                                                            | Ownership enforced by the server on every request                                         | ⏳                |
| D1  | Students submit DOB, photo and approved personal-information corrections                                          | Sensitive changes need admin approval                                                     | ⏳                |
| D2  | Pending changes separate from authoritative records                                                               | Change-request model with audit trail                                                     | ⏳                |
| D3  | Students cannot edit marks, grades, published results, registration identifiers or issued certificates            | Read-only in the portal                                                                   | ⏳                |
| E1  | Staff upload results, marksheets and grades                                                                       | Result import reuses the Phase 5 import subsystem                                         | ⏳                |
| E2  | Published results appear in the student portal automatically                                                      | Driven by the existing PUBLISHED status                                                   | ⏳                |
| E3  | Students download permitted official documents                                                                    | Streamed after an ownership check                                                         | ⏳                |
| F1  | One authoritative PostgreSQL backend for admin, student and public verification                                   | No duplicate student database or certificate registry                                     | ✅ (architecture) |
| G1  | Real student data is never committed (workbooks, national IDs, photos, certificate images)                        | Synthetic fixtures only                                                                   | ✅                |
| G2  | National ID numbers are never imported into public-facing fields                                                  | Identity-number columns are never imported, staged or shown                               | ✅ Phase 5        |

The source workbook `Registration 2025.xlsx` was inspected for **structure only**; see the
[column mapping report](../imports/registration-2025-mapping.md). It is not in the repository, and no
real row has been imported anywhere.
