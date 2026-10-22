# ADR-0019: Registration-scoped academic certificate samples

Status: Accepted for Phase 12C.1

## Context

UI-05 shows every student one fixed training sample. Phase 12C added five synthetic academic templates
and per-registration course eligibility. Students should see academic sample layouts only for
certificate types their own course offers, without implying qualification or issuance.

## Decision

- **Pinned, pre-rendered samples.** The five standard synthetic PDFs are rendered once by the Phase
  12C renderer and shipped as private package assets with SHA-256, size, header and identity pins.
  Requests never render. Verification fails closed, and diagnostics never echo caller input. A
  structural drift test (geometry, drawing operators with arguments, placed text) keeps the shipped
  files equal to fresh renders of the approved templates.
- **Separate, registration-scoped endpoint.** Academic samples use
  `/student/certificate-samples/registrations/:registrationId/:sampleId/file`. UI-05's training
  endpoint is unchanged and remains independent of course eligibility.
- **Server-side decision on every request.** The type comes from the sample identifier, and
  eligibility comes from the Phase 12C resolver for that registration. Only `APPROVED_FOR_COURSE`
  is served; everything else, including other students' registrations, is 404. Synthetic approvals
  exist only in isolated tests and the disposable e2e database. There is no production bypass.
- **Student choice, no default.** With several registrations the page shows a selector with nothing
  preselected; with one, that course is shown directly.

## Consequences

Until the university authorizes an approver of course certificate sets, no academic sample is
available in production. Students see their course's types with explanations, plus the training
sample. Changing a template requires regenerating and re-pinning its sample.
