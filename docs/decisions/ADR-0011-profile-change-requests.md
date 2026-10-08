# ADR-0011: Students request profile changes; staff approve with stale-data protection

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

Many imported students have no date of birth or photo on record, and some names contain errors. The
university wants students to supply this information themselves, but the official record must remain under
the registrar's control. Staff may also correct the same record directly while a request is waiting.

## Decision

1. **Requests, not edits.** A new table `student_profile_change_requests` holds the proposed values
   (`proposed_changes`, only the requested fields), an immutable snapshot of the official values at
   submission (`current_snapshot`, plus the photo key in an internal column), an optional student note,
   and the staged photo. Students never write `students`.
2. **One pending request per student**, enforced by a partial unique index. This removes conflicts
   between competing requests; a student cancels to change their request.
3. **Approval re-checks under row locks.** The request and student rows are locked; if any requested field
   (or the photo) differs from the submission snapshot the approval is refused (`409`), so newer official
   data is never silently overwritten. Only the requested fields are written. The request's decision and
   its audit entries commit in the same transaction.
4. **The database guards the lifecycle** (trigger `docversity_profile_change_requests_guard`, SQLSTATE
   `DV001`): rows are created `PENDING`, submission columns are immutable, a decision happens once, the
   submitting account must belong to the student, rows cannot be deleted; CHECKs tie reviewer/reason/
   cancellation columns to the status.
5. **Photos are decoded and re-encoded server-side** (`sharp`, already a Next.js dependency): the content
   decides the format, dimensions are bounded, a pixel budget guards against decompression bombs, and the
   stored JPEG has no metadata. Objects are private, under generated keys, served only after an ownership
   or permission check with `Cache-Control: no-store`. The approved request's object becomes the official
   photo (objects are never overwritten).
6. **Separate permissions** `studentProfileRequests.read` / `.review`, granted to REGISTRAR.

## Consequences

- A stale request must be rejected and resubmitted; there is no field-by-field merge or partial approval.
- Correcting an existing date of birth is not a student request; it stays with the registrar.
- Photos of rejected/cancelled requests remain in private storage as evidence. A retention job is future
  work (see roadmap).
