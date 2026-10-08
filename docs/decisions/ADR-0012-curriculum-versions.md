# ADR-0012: Curriculum versions own subject assignments

- **Status:** Proposed for Phase 7B review
- **Date:** 2026-10-09

Keep Program as the authoritative course and extend the existing Subject/ProgramSubject foundations. A ProgramCurriculum owns a fixed semester/year structure and its ProgramSubject assignments; the existing `semester_number` column represents either academic period and existing result references remain intact. Creating a second course/subject store would split academic identity and require rewriting historic result links.

Drafts are editable. Activation freezes curriculum and assignment definitions; archival prevents new registrations while keeping existing associations readable. Catalogue code/title/category are protected once used in active/archived curricula or results. Registration assignment is an explicit staff action, never inferred from dates or imports, and any registration with results is protected from assignment changes. Legacy placements are backfilled into draft versions without assigning registrations; legacy result references freeze their definitions even in those drafts.

Effective dates are inclusive and open-ended when absent. Overlapping active versions of one program are refused; closing the earlier end date or archiving it permits another version. This avoids a hidden date-based syllabus choice while allowing explicit batch association. University-specific rollover and grading policy remain separate decisions; this phase does not implement examinations, result workflows or certificates.

Legacy compatibility: unrelated course edits preserve existing duration, including values above current input bounds. Curriculum reads include original placements outside the declared periods with an explicit legacy label. Activation rejects those placements through API and additive database guards until the university authorizes a consistent structure; historic rows and student/result references are never silently rewritten.
