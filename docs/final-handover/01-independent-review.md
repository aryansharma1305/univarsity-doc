# Stage 1 independent source review

Baseline: `d791afd7da3b0efc2db7965cc3a2fa6417a90d60` plus the uncommitted security diff.
All reviewers were read-only. They did not edit source, run tests, launch Docker or access data.
Their findings informed parent-run synthetic reproductions; they do not certify runtime checks.

## Authentication reviewer

Reviewed activation authority/Serializable conflict rejection, credential-bound staff/student
sessions, current-session preservation, SQL credential compare-and-set and reset-store semantics.

Identified two reset-store races and the separate older-reset-versus-newer-reset overwrite. The parent
reproduced each before correction. Revised-source review found no additional concrete defect.
Atomic token replacement/consumption retains TTL and namespace restrictions; consumption rejects
superseded/orphaned links and cannot remove a newer pointer. Reset SQL replacement rejects an active
account/hash mismatch before overwriting the recovered password or revoking its sessions. Expected
CAS failure maps to the existing invalid-link response; unrelated DB/service failures are not swallowed.
Student legacy-binding rejection is now covered independently from staff.

## Upload/resource and academic reviewer

Reviewed PDF tokenization/object streams, sparse workbook loading, row locks and profile lifecycle.
Identified the PDF NUL terminator, sparse allocation, a cleanup defect in a discarded streaming draft,
and a ZIP central/local filename disagreement bypass in the draft XML classifier. Parent used inert
fixtures and bounded local checks before corrections. The streaming draft was removed entirely.

Revised-source review found no further concrete bypass in the inspected preflight. It classifies
inflated bytes rather than names, SAX-inspects without a document tree or temporary files, rejects
DTD/parser errors and enforces structural positions. Nonempty-cell iteration avoids sparse gap
allocation. Added controls exercise BOM/whitespace, decoded attributes and malformed XML.
Academic/profile locking and fresh-snapshot checks had no additional source defect; photo cleanup now
has a storage-preservation assertion.

## Final integrated reviewer

A fresh reviewer inspected the final authentication/activation, reset Lua/CAS, Redis session updates,
PDF guard, XLSX structural checks, academic/profile changes and regressions. No additional concrete
defect was found in that diff. This is scoped source evidence, not exhaustive vulnerability clearance.

## Compatibility and residual risks

- All pre-upgrade staff/student sessions without credential bindings require re-login.
- New compressed-object-stream PDFs, including payment evidence, require plain static re-export.
- Existing stored PDFs are neither rewritten nor revalidated by this change.
- Global XLSX position ceilings are additional safety limits, not configured nonblank-data limits
  and not a guarantee that every accepted dense workbook fits every production heap.
- Runtime Redis here is standalone; the dynamic-key reset scripts do not claim Redis Cluster support.
- Default password-reset delivery remains disabled. No real notifier, payment provider, publication,
  certificate issuance/signing or public-verification activation is added.

Parent runtime evidence and final gate status are recorded separately in the security report.
