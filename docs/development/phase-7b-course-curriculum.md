# Phase 7B — Course management and curriculum versions

Branch: `feature/course-curriculum-management`. Baseline: Phase 7 merge
`47a64ea511eca52cad6d732db7ef38609a9d6271`. Phase 7B only; no examination workflow, result
publication, certificates or deployment is included.

## Implemented

Staff maintain courses with independent duration and semester/year structure, create named curriculum
versions, copy an existing version into a draft, reuse the subject catalogue, and configure per-version
credits/classification/marks/components. Each period has an ordered placement list. Activation freezes
academic definitions; archived versions remain readable. Staff explicitly associate registrations with
an active version. Students can read their own assigned course subjects.

The existing admin and student design systems remain in use. Desktop tables become mobile cards;
mobile navigation remains the existing accessible drawer. Forms expose validation errors, pending states,
permission restrictions and empty/unavailable states. Missing marks and unassigned curriculum versions
are displayed honestly. Sonner feedback uses the existing accessible semantic status colors.

## Relationships and rules

`Program → ProgramCurriculum → ProgramSubject → Subject`; `StudentRegistration → ProgramCurriculum`
is optional and explicit. `ProgramSubject.semester_number` stores the academic period for either
structure; existing result references remain unchanged. Duration does not determine period count.
Legacy programs without structure remain editable without invented values.

A catalogue subject can occur once in a version, in one period. Assignment credits/marks belong to the
version rather than mutable catalogue defaults. Classification is required for new placements; migrated
unknown classification remains unknown. Period numbers are bounded by the version's period count.
Draft placements can be moved/reordered/removed; marks components have unique names, valid maxima and
passing thresholds, and must total a supplied maximum. See [API rules](../api/curricula.md).

Lifecycle is DRAFT → ACTIVE → ARCHIVED, or DRAFT → ARCHIVED. Activation requires at least one subject
and rejects inclusive overlapping active effective windows. Dates do not assign students automatically.
Activation is an explicit authorized registrar/admin action; a separate approval workflow is not built.
To supersede an open-ended version, explicitly close its effective window or archive it before activating
an overlapping replacement. Already assigned students keep the original version.

Assignment selects registrations from the same program. Search, batch and assignment-state filters are
available in the UI; academic-session filtering also exists in the API. Bulk requests accept at most
500 distinct IDs. Existing assignments are skipped unless replacement is explicitly selected. Any
registration with results is skipped, including a legacy result-bearing registration with no version.
The response explains skipped entries. Imports do not guess or autoassign a curriculum.

## Historical integrity and migrations

All historical migrations are unchanged. Three appended migrations:

1. `20261011090000_course_curriculum_management`: version model, structure/duration fields, catalogue
   classification, per-version placements and optional registration link; legacy placements backfilled
   into DRAFT versions using their original version labels. No registration is assigned automatically.
2. `20261011093000_curriculum_history_guards`: freezes historical catalogue identity, result-bearing
   placement definitions and draft version definitions, and protects first assignment of legacy
   result-bearing registrations. Uses PostgreSQL `DV001` guards in addition to API validation.
3. `20261011094000_preserve_assignment_delete_restrict`: retains the original FK RESTRICT error for
   deleting result-referenced placements while preserving all update protection.

Version activation locks catalogue rows; copying locks the source version; assignments lock version and
registration rows before state checks. Course/version lock ordering is consistent. Retiring a catalogue
subject does not remove its history; changing a used subject's title/code/category requires a new subject.
No result data is rewritten. Future examinations/results can resolve subjects through the registration's
assigned version; grading schemes and publishing workflows remain future work.

Fresh databases are exercised by database/API tests and the E2E preparation migration chain. The isolated
synthetic upgrade script applies the pre-7B migration chain, creates a program, registration, legacy
placement and published result, then applies all three migrations. It compares original registration,
placement and result columns, checks null student assignment and the draft backfill, and rejects history
rewrites. Run `node packages/database/scripts/verify-curriculum-upgrade.mjs` from the repository root.

## Routes, permissions and audit

- `/admin/programs`: course management list and course creation/edit.
- `/admin/programs/[id]`: course details and curriculum versions.
- `/admin/programs/[id]/curricula/[curriculumId]`: period editor, lifecycle and student assignment.
- `/admin/subjects`: reusable subject catalogue.
- `/student/course`: own assigned curriculum, subjects and honest unassigned state.

[Endpoint reference](../api/curricula.md) lists every route. SUPER_ADMIN and REGISTRAR can mutate;
existing read-only staff roles can read. APIs enforce permissions independently of visible controls.
New permissions: `subjects.read/write`, `curricula.read/write/activate/archive`, `studentCurricula.assign`.
New audit actions cover catalogue creation/update/status, version creation/update/activation/archive,
placement add/edit/remove/reorder, and student assignment. Writes and audit entries share a transaction;
metadata contains identifiers, codes, changed field names and counts, without personal data or secrets.

## Evidence and verification

The screenshot matrix below uses only generated synthetic E2E records. Every listed surface is captured
at 1440, 1280, 768 and 390 pixels. Axe checks report no serious/critical violations on these screens;
page overflow and subject-assignment dialog overflow are asserted. Mobile long forms scroll to expose
footer actions. The independent Impeccable finish handoff and final gate results are recorded below once
completed.

| Surface                       | 1440                                                          | 1280                                                        | 768                                                         | 390                                                         |
| ----------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| course list                   | [desktop](phase-7b/course-list-desktop.png)                   | [laptop](phase-7b/course-list-laptop.png)                   | [tablet](phase-7b/course-list-tablet.png)                   | [mobile](phase-7b/course-list-mobile.png)                   |
| course create                 | [desktop](phase-7b/course-create-desktop.png)                 | [laptop](phase-7b/course-create-laptop.png)                 | [tablet](phase-7b/course-create-tablet.png)                 | [mobile](phase-7b/course-create-mobile.png)                 |
| curriculum list               | [desktop](phase-7b/curriculum-list-desktop.png)               | [laptop](phase-7b/curriculum-list-laptop.png)               | [tablet](phase-7b/curriculum-list-tablet.png)               | [mobile](phase-7b/curriculum-list-mobile.png)               |
| curriculum semester editor    | [desktop](phase-7b/curriculum-semester-editor-desktop.png)    | [laptop](phase-7b/curriculum-semester-editor-laptop.png)    | [tablet](phase-7b/curriculum-semester-editor-tablet.png)    | [mobile](phase-7b/curriculum-semester-editor-mobile.png)    |
| curriculum year editor        | [desktop](phase-7b/curriculum-year-editor-desktop.png)        | [laptop](phase-7b/curriculum-year-editor-laptop.png)        | [tablet](phase-7b/curriculum-year-editor-tablet.png)        | [mobile](phase-7b/curriculum-year-editor-mobile.png)        |
| subject catalogue             | [desktop](phase-7b/subject-catalogue-desktop.png)             | [laptop](phase-7b/subject-catalogue-laptop.png)             | [tablet](phase-7b/subject-catalogue-tablet.png)             | [mobile](phase-7b/subject-catalogue-mobile.png)             |
| subject create                | [desktop](phase-7b/subject-create-desktop.png)                | [laptop](phase-7b/subject-create-laptop.png)                | [tablet](phase-7b/subject-create-tablet.png)                | [mobile](phase-7b/subject-create-mobile.png)                |
| curriculum subject assignment | [desktop](phase-7b/curriculum-subject-assignment-desktop.png) | [laptop](phase-7b/curriculum-subject-assignment-laptop.png) | [tablet](phase-7b/curriculum-subject-assignment-tablet.png) | [mobile](phase-7b/curriculum-subject-assignment-mobile.png) |
| curriculum archive confirm    | [desktop](phase-7b/curriculum-archive-confirm-desktop.png)    | [laptop](phase-7b/curriculum-archive-confirm-laptop.png)    | [tablet](phase-7b/curriculum-archive-confirm-tablet.png)    | [mobile](phase-7b/curriculum-archive-confirm-mobile.png)    |

[Explicit staff assignment](phase-7b/curriculum-students-assigned-desktop.png) · [Student own course](phase-7b/student-assigned-curriculum-mobile.png) · [Activation confirmation](phase-7b/curriculum-activate-confirm-desktop.png)

| Gate                         | Result                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Format                       | Pass                                                                                               |
| Lint (`--force`)             | Pass; existing TanStack compiler warning remains                                                   |
| Typecheck (`--force`)        | Pass                                                                                               |
| Unit/integration (`--force`) | 448 tests (types 14, validation 26, storage 3, imports 60, database 85, worker 7, web 50, API 203) |
| Production build (`--force`) | Pass                                                                                               |
| Database drift               | No difference detected                                                                             |
| Synthetic upgrade            | Pass; published legacy result preserved                                                            |
| Browser E2E (`--force`)      | 27 tests; real API and database                                                                    |

The first screenshot inspection caught a mobile assignment form widened by a nonwrapping catalogue
link. Fixed at the dialog/form grid and wrapping link. Independent finish review requested clearer
catalogue retry and student unavailable states plus 40px editor/registration selection targets. Those
fixes have component coverage, including successful retry and unavailable-versus-unassigned distinction.
Independent final confirmation: **disposition: ship** for all three scored fixes; 38 required
recaptures remain valid, with no regressions introduced by the fix batch. The design documenter found
no system changes necessary; unrelated legacy reference-document drift is left unchanged.

The knowledge graph was refreshed through `graphify update .` (no manual graph edits). Its SQL parser
is not installed and one existing database export was only partially extracted; the graph remains a
navigation aid, with source/migrations/ADRs authoritative.

## Manual acceptance checklist

- Create a semester-wise course; set duration independently from number of semesters.
- Create a draft version; add/reuse subjects across periods and configure credits/components.
- Try duplicate catalogue codes, invalid periods, mismatched component totals and passing > maximum.
- Activate, confirm read-only subjects, and reject an overlapping active version.
- Copy an active version, change the draft, and confirm the original remains unchanged.
- Create a year-wise course and reuse a catalogue subject with independent placement settings.
- Assign selected same-program registrations; inspect skipped reasons and explicit replacement.
- Confirm result-bearing registrations cannot be assigned or moved, including legacy unassigned ones.
- Sign in as a student and verify only their own version/subjects appear; check an unassigned account.
- Verify read-only staff cannot write through either the UI or direct API.
- Use the 390px drawer, period tabs, scrolling forms and lifecycle confirmations with keyboard focus.
- Archive a version and confirm old students retain its readable history.

## Limitations and university decisions

The supplied attachment omits requirements sections 4–16 (literal “394 lines hidden”) and truncates
several lines. This implementation follows the visible goals, existing schema and preserved work;
complete acceptance against those missing sections remains pending the university's full brief.

Legacy backfilled versions keep the DRAFT label even when results protect their definitions; attempted
historical edits are rejected by the database. Legacy periods outside the current 40-period bound need
university review before activating a replacement.

University decisions still needed: exact credit/marks/grading policies, whether every period needs a
minimum subject count, separate academic approval authority, effective-date/batch mapping, permissible
legacy course structure, and any sanctioned historical correction process. Current input caps are
technical validation bounds, not university policy. No automatic enrollment rollover, catalogue merge,
batch inference, subject deletion, grading calculation or results workflow is introduced.
