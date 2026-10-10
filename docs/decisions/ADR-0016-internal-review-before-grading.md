# ADR-0016: Review marks independently of grading and publication

Status: Accepted for Phase 10D infrastructure; approval role policy pending. Date: 2026-10-11.

Reuse Result's DRAFT → UNDER_REVIEW → APPROVED states for internal marks review. Each state action
stores an immutable marks snapshot and version receipt. Return/rejection moves a result to DRAFT with
a reason, preserving previously reviewed marks; correction reuses Phase 10C. Null subject outcomes
can enter internal review only through this guarded workflow. This supersedes ADR-0015's requirement
to invent or obtain grading outcomes before any internal review, while retaining its published-data
protections and exact approved-application attempt numbering.

Approval does not establish a grade, pass/fail decision, public result selection or student visibility.
Those university policies remain unresolved. Publication of this workflow is disabled in the API and
database. An environment flag cannot silently authorize it. Legacy graded/published records retain
their existing history and guards. Append-only transition receipts prevent retry duplication and keep
reviewed versions available after corrections without creating replacement examination attempts.
