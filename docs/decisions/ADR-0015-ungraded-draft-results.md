# ADR-0015: Persist ungraded drafts without choosing university grading policy

Status: Accepted for Phase 10C. Date: 2026-10-10.

Reuse `Result` and its subject `ResultItem` lines; permit a null item outcome only in a DRAFT and
block that result from leaving DRAFT until outcomes are assigned by a future approved workflow.
Using PASS, FAIL or ABSENT as a placeholder would invent academic meaning, while separate marks
staging would duplicate the existing result identity. Existing outcomes, result revision uniqueness
and published-record guards remain unchanged.

A regular examination uses attempt 1. As explicitly confirmed by the user, a re-examination draft
links to an APPROVED application for its exact examination, registration and curriculum subject and
preserves that application's attempt number, without adding one. Examination identity separates the
regular and re-exam attempts; this establishes no carry-forward, replacement or GPA policy.

Manual editing checks a numeric aggregate version. Excel saving requires a fresh server-side plan,
explicit confirmation and a matching digest; it creates subjects, skips identical marks and rejects
conflicting drafts for manual review. Serializable transactions commit marks, actor-attributed
before/after audit events and an append-only batch receipt together. A durable batch UUID prevents
replay duplicates even though its source preview expires after two hours. Expired/discarded sources
cannot be committed or replayed. Excel never updates existing marks automatically.
