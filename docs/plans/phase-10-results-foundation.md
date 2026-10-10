# Phase 10: Manual Marks Entry & Excel Results Import Foundation

## 1. Corrected Architecture

- **Database Schema Verification**: The `Result`, `ResultItem`, `Examination`, and `GradingScheme` schemas already exist and support a robust linear revision history via `attemptNumber`, `revisionNumber`, and `supersedesResultId`.
- **States & Lifecycle**: The models currently support `DRAFT`, `UNDER_REVIEW`, `APPROVED`, and `PUBLISHED` states natively. We will strictly adhere to these without inventing new states. All manual and Excel-imported marks will solely produce `DRAFT` records. No automatic approval or publication will be implemented.
- **Security & Integrity**: Staff RBAC will govern marks entry. Student ownership boundaries will prevent data leaks. The `PUBLISHED` state remains fully immutable via existing database triggers. Append-only audit logs will record all manual entry and import actions.

## 2. Semester/Year Compatibility

- The academic period must dynamically derive from the student's assigned `ProgramCurriculum` and its `structureType` (Semester vs. Year).
- `ProgramSubject.semesterNumber` maps generically to the academic period regardless of the structure.
- Context selectors and validation rules will dynamically enforce subject assignments against the student's exact curriculum version, naturally accommodating both semester-based and year-based schedules without assumptions.

## 3. Manual Marks-Entry Workflow

- **Context Selection**: Admin selects the target `Examination` context, `Program`, `Curriculum`, and `AcademicSession`.
- **Filtering**: Subjects and students populate strictly based on the assigned curriculum and structure type.
- **Data Entry**: A grid interface allows inputting component marks (e.g., internal, external) as defined by the curriculum.
- **Save & Draft**: The workflow only creates or updates `DRAFT` results. Drafts are safely saved for later review.

## 4. Excel Import Mapping/Validation Specification

- **Template Design**:
  - `Registration Number` (Required identifier)
  - `Subject Code` (Required to resolve curriculum identity)
  - `Exam Context` (if not globally selected during the import setup)
  - Configured Marks Components (e.g., `Internal Marks`, `External Marks`, `Practical Marks`)
- **Validation**:
  - Validates `Registration Number` against the database.
  - Resolves the `Subject Code` strictly through the student's assigned `ProgramCurriculum`.
  - Ensures the subject belongs to the correct academic period (semester/year).
  - Validates marks components against maxima configured in `ProgramSubject`.
  - Reports row-level errors for unknown subjects, invalid registrations, mismatched academic periods, and duplicates within the file.

## 5. Original Exam and Re-Exam Attempt Preservation

- We will fully respect `attemptNumber` and `revisionNumber` in the `Result` schema.
- Re-exam results will be stored as independent attempts (e.g., `attemptNumber = 2`) rather than silently replacing or overwriting the original `attemptNumber = 1` marks.
- Every attempt retains its own history, fulfilling the requirement to preserve original examination results permanently.

## 6. Result Conflict-Resolution Policy

- **No Unrestricted Bulk Upsert**: Imports and manual entries will not blindly overwrite existing records.
- **Conflict Detection**: During the `import.commit` phase, the engine will detect:
  - Existing `PUBLISHED` results (these cannot be updated via draft imports).
  - Existing `DRAFT` results (importing over an existing draft requires explicit confirmation/resolution by the user).
  - Previously imported marks for the same exam attempt.
- Explicit user handling and review will be required before final bulk commit to prevent unintended data loss or corruption.

## 7. Explicit Phase 9 Integration Dependencies

- **Examination Lifecycle**: We will rely entirely on Phase 9's definition and management of the `Examination` entity. We will not create or assume foreign keys outside of the established contracts.
- **Grading Schemes**: We will not define passing marks, letter grades, GPA/CGPA calculations, weightages, or publication permissions. All such grading mathematics are deferred to Phase 9 contracts and official university policy configuration.

## 8. University Policy Questions

- **Policy Config**: Once the university confirms grade boundaries, pass/fail policies, and GPA/CGPA formulas, where will the calculation step reside in the workflow? (e.g., manually triggered calculation before approval, or handled externally?)
- **Re-exam Replacement**: How do re-exam marks affect the overall program calculation? (This rule will need university confirmation before final grading logic is applied).
- **Draft Conflict Resolution**: If an Excel import conflicts with an existing `DRAFT` created via manual entry, does the Excel file take precedence or should the row be completely rejected?

## 9. Proposed Implementation Stages

1. **Independent Excel Parsing & Validation Components (DONE - HARDENED)**: Built pure-function validators for marks components and registration lookups that reuse Phase 5 infra but don't interact with Phase 9 schemas yet. Added numeric precision checks (DECIMAL(5,2) max magnitude < 10000), academic period mismatch checks, formula/numeric registration integrity checks, missing required components detection, explicit grade-only import rejections, and examination-context duplicate checking. Attempt context is completely separated from revision identity. Blank, zero, missing, and 'NA' values are maintained distinctly by emitting `INVALID_NUMBER` for non-numeric special codes until university policy defines them.
2. **Import Engine Extension**: Add `ImportType.RESULTS` and the associated mapping/validation state machine.
3. **Manual Entry Frontend & Draft APIs**: Develop the UX context selectors and grid for manual marks entry (saving strictly as `DRAFT`).
4. **Conflict Resolution UI**: Implement the explicit conflict-handling UI for the import review stage.
5. _(Deferred)_: Integration with Phase 9 grading calculations and final result publication logic.

## 10. Phase 10B delivery boundary

The results upload/mapping/validation preview is implemented separately from persistent student
import jobs. See [API and lifecycle](../api/result-import-previews.md). It retains source and
classified rows privately in Redis for two hours and exposes no commit operation. Persistent
RESULTS staging, manual marks entry, result conflict resolution, attempt/revision policy and
approval/publication remain later phases. No new database migration is required.

## 11. Phase 10C draft persistence

Manual drafts and confirmed Excel-to-draft saving reuse the existing Result/ResultItem identity.
See [Phase 10C design](phase-10c-draft-results.md), [API](../api/draft-results.md) and
[ADR-0015](../decisions/ADR-0015-ungraded-draft-results.md). Re-exam result attempts preserve the
approved application's number exactly, as confirmed; no automatic increment, replacement or
carry-forward is inferred. Excel rejects different existing draft marks for manual resolution.
Nullable draft outcomes remove the need to invent pass/fail; approval/publication remains deferred.
