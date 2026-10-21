# ADR-0018: Course certificate eligibility under a versioned duration policy

Status: Accepted for Phase 12C infrastructure (approval disabled pending university authorization)

## Context

The university mentor clarified that certificate types depend on course duration: 2–3 and 6-month
courses receive a Course Completion certificate only; courses longer than 1 year receive Transcript,
Provisional and Character certificates; courses longer than 2 years also receive a Migration
certificate. Exactly 12 months, 4–5 months, 7–11 months, under 2 months and missing durations were
not specified. Phase 12B offered all four academic types to every student. Programs already store
`duration_value` + `duration_unit`; students can hold several registrations.

## Decision

1. **Code-defined, versioned policy** (`@docversity/validation`, `certificate-eligibility/policy.ts`):
   an immutable snapshot (`UNIVERSITY_COURSE_DURATION_CERTIFICATES` v1) evaluated on the server from
   the program record, normalised to whole months. Unspecified durations fail closed with a named
   reason. Exactly 24 months follows the literal "more than 1 year" tier (no Migration). Degree-length
   courses are not assumed to receive Course Completion. A rule change is a new version, never an edit.
2. **Course configuration is separate from the policy.** `program_certificate_eligibility` stores
   proposed sets (a subset of the tier's types, with a university authority reference) and their
   decisions. Duration alone never approves anything. One open proposal and one approval per course;
   a new approval supersedes the old. Rows are never edited or deleted.
3. **Separation of duties.** `certificateEligibility.propose` (REGISTRAR) and
   `certificateEligibility.approve` (no role beyond SUPER_ADMIN's catch-all) are distinct; the
   database rejects a decider equal to the proposer. Approval additionally requires a code-defined
   university approval authority, which does not exist yet, so approval is **disabled** in every
   environment; isolated tests supply a synthetic one under `NODE_ENV=test` only.
4. **Fail-closed resolution.** A type is `APPROVED_FOR_COURSE` only if the current policy permits it,
   an approved configuration names it, and that configuration still matches the course's current
   duration and policy version. Otherwise it is `PENDING_COURSE_APPROVAL`, `NOT_OFFERED_FOR_COURSE` or
   `POLICY_UNRESOLVED`. The database independently re-checks the v1 tier→type mapping and the course
   duration at proposal and approval.
5. **Registration-specific student contract** (`docversity.student-certificate-eligibility` v1).
   Identity comes from the student session. All of the student's registrations are returned; a single
   registration may be requested explicitly by ID, with server-side ownership (404 otherwise). This is
   the one deliberate exception to "student endpoints take no registration IDs", agreed for Phase 12C;
   no first/latest/active registration is ever chosen automatically.
6. **Four questions stay separate**: type eligibility, application availability (Phase 12B policies,
   unchanged), course completion (`NOT_EVALUATED`) and Finance/Rector/issuance (`NOT_AVAILABLE`).
   Eligibility never enables a Phase 12B submission.
7. `COURSE_COMPLETION` joins the shared application type contract only. The
   `certificate_request_type_check` constraint and `DocumentType` enum are unchanged, so it cannot be
   stored as a request or credential until a reviewed policy and migration activate it. The Phase 12A
   `TRAINING_CERTIFICATE` stays a separate training document and is not an alias.

## Consequences

Students and staff see truthful per-course labels now; nothing becomes "offered" in production until
the university authorizes an approver and staff approve each course. Changing a course's duration (or
a new policy version) makes earlier approvals out of date automatically. A future policy version needs
both a code snapshot and a migration extending the database CHECK. Binding Phase 12B applications to a
registration and requiring `APPROVED_FOR_COURSE` before submission is a required follow-up before any
application policy is activated.
