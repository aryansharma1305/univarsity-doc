# ADR-0014: Examinations stay external; Docversity keeps records, re-exam applications and manual payment evidence

- **Status:** Accepted (Phase 9, split into 9A/9B/9C)
- **Date:** 2026-10-09

## Context

The university already conducts examinations in a separate mobile application. It asked Docversity for
links to that application, examination records per course structure, re-exam applications with a
confirmed fee schedule (first re-exam INR 1,000, second INR 2,500) and country/region-based QR payments
verified manually. Several policies are unconfirmed: whether the fee is per paper, per application or
per examination session; how attempts are counted; third-attempt fees; whether approval needs payment;
FX/regional amounts; the manual-marks rules.

## Decision

1. **No examination-taking in Docversity** (9A). No MCQs, timers, proctoring, submissions, evaluation or
   synchronisation with the external application. Docversity stores staff-configured https links to it
   and tells students plainly that examinations happen there.
2. **Examination records reuse `examinations`** (9A), extended additively with `curriculum_id`
   (composite FK keeping it in the program), `kind` (REGULAR / RE_EXAMINATION) and a re-exam
   applications switch. `semester_number` is a period of the curriculum (semester or year), checked by a
   trigger. Records schedule nothing and decide no eligibility.
3. **One assessment per re-exam application** (9B): a registration + re-examination record + subject of
   the curriculum. This makes duplicate prevention and attempt numbers unambiguous. Identity (name,
   registration number, program, session, period) is snapshotted from the registration — never typed by
   the student.
4. **Attempt numbers are server-derived** (9B) from recorded re-exam applications of the same
   registration and catalogue subject; the basis is stored with the application. Fees come from a
   **versioned fee rule** whose **scope must be chosen explicitly by staff**; amounts are integer minor
   units; the rule version, scope, amount and currency are snapshotted on the application. Attempts
   without an approved fee (e.g. a third re-exam) or unsupported scopes block payment with a
   configuration message — no amount is invented.
5. **Payments are external and manual** (9C). Staff configure per country/region group the account
   display name, method, currency, amounts (the fee rule's, or explicitly approved per-attempt amounts in
   another currency — never a computed conversion), instructions, validity and a private QR image (served
   re-encoded without metadata). Students submit a transaction reference and optional receipt; only staff
   with a separate permission confirm or reject after checking the university's account. Nothing ever
   becomes "paid" automatically; a reference can be confirmed once only.
6. **Separation of duties.** Configuring examinations (EXAM_ADMIN), deciding applications
   (EXAM_ADMIN), verifying payments (APPROVER) and configuring fees/payment destinations (SUPER_ADMIN
   until a finance role is agreed) are separate permissions. Submitting payment never approves an
   application.
7. **Manual marks entry is designed, not built** (Part F) — see
   [manual-marks-entry.md](../architecture/manual-marks-entry.md). No grades or results are calculated.

## Consequences

- Policy gaps are visible as configuration states or blocked actions, not as guessed rules.
- New role rows are not needed (no migration inserts roles); the permission mapping is a proposal
  pending sign-off.
- Phase 10 must decide the attempt mapping between results and re-exam applications.

## Addendum (Phase 9C implementation, 2026-10-10)

- Decision 5 is implemented with **maker–checker approval** of payment destinations (the approver must
  differ from the preparer and from whoever last changed the draft, also enforced by database CHECKs) and **versioned, frozen** destinations:
  replacing a QR means approving a replacement version, which retires the old one atomically while
  existing payments keep pointing at their version.
- An obligation's amount is the application's own assessed fee when the currencies match, otherwise only
  an explicitly approved per-attempt amount of the destination; the database trigger re-derives it, so a
  conversion or invented amount cannot be stored.
- Stored states are `AWAITING_PAYMENT`, `SUBMITTED`, `VERIFIED`, `REJECTED` and `VOID` (region changed
  before paying). `NOT_CONFIGURED` is derived (no row); `UNDER_REVIEW` was not added because verification is
  a single locked, atomic step — there is no claim/hand-off between reviewers to model.
- Verification requires the amount and currency actually received to equal the obligation and an explicit
  confirmation that the university's account was checked; partial/excess payments, refunds and
  reconciliation of one transaction across several applications are not supported (P9) and are rejected
  with a reason.
