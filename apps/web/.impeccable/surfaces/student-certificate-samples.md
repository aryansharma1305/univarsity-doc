# Student certificate samples

Primary target: apps/web/src/features/student-portal/certificate-samples.tsx
Related target: apps/web/src/features/student-portal/student-documents.tsx
Related target: apps/web/src/features/certificate-requests/views.tsx
Mode: Operate. Code-led local extension of approved UI-03 / Phase 12B.

## Direction and first viewport

Preserve portal identity, typography, tokens, shell and navigation. My Documents gains one compact
sample section before owned published documents, with a secondary Certificate Requests link (user
confirmed). A clear Training Certificate name, exact illustrative-only explanation and two direct
PDF actions form the primary group. Desktop uses two columns within one existing PortalCard;
390px stacks readable copy and 44px actions. No new navigation item or competing certificate area.
Other four sample formats stay honestly unavailable. No claim that training applies to all courses.

## Interaction and safeguards

Reuse StudentActionMotion with reduced-motion behavior; no new entrance style or animation. Native
preview opens the protected PDF in a new tab, download uses attachment; keyboard focus remains
visible. No modal needed for a native PDF task. No student inputs/props or identifiers. A static
PDF from the approved Phase 12A renderer contains fictional fixed data, SAMPLE watermark, blank
signature lines and invalid synthetic QR. No real issuance, verification, grades or eligibility.

## Delivery

Provide screenshots at 1440/768/390, actual sample PDF, security/interaction tests, all gates and
data preservation evidence. Visual approval received 17 October 2026 with a shorter illustrative-only
intro; commit/push/draft PR authorized after final gates. No merge. Phase 12C eligibility remains
isolated until its typed server API is available for a separate follow-up.
