# Phase 10: Manual Marks Entry & Excel Results Import Foundation

## 1. Existing Architecture Audit
- **Database Schema**: The `Result`, `ResultItem`, and `GradingScheme` models are present. They support a linear revision history (superseding), draft/published workflow statuses, and line-item details mapping to `ProgramSubject`s.
- **Examinations**: The `Examination` model exists and tracks the exam lifecycle, linking to the `AcademicSession` and `GradingScheme`.
- **Import Engine**: A robust, worker-based state machine (`ImportJob`, `ImportRow`) exists for Phase 5 (Students). It is idempotent, transactional, and uses staging tables before committing. It is built to be extensible for `ImportType.RESULTS`.
- **Integrity**: Existing triggers and `CHECK` constraints strictly enforce immutability of `PUBLISHED` results and prevent unauthorized updates.

## 2. Proposed Results Data Flow
**Manual Flow:**
- Administrator selects context: `Program` → `Curriculum` → `AcademicSession` → `Semester` → `Examination`.
- The system fetches all `StudentRegistration` records matching the criteria, and their assigned `ProgramSubject`s.
- Input marks are saved as `DRAFT` in `Result` and `ResultItem`.
- The `Result` undergoes state transitions: `DRAFT` → `UNDER_REVIEW` → `APPROVED` → `PUBLISHED`.

**Excel Import Flow:**
- Adheres to the existing `UPLOADED` → `MAPPING` → `VALIDATING` → `VALIDATED` → `PROCESSING` → `COMPLETED` pipeline.
- Validation step enforces marks boundaries based on `ProgramSubject` configurations.
- Committing the import creates `DRAFT` records in `Result` / `ResultItem`, leaving publication to manual review.

## 3. Excel Template Design
The template will adopt a vertical format (one row per subject per student) rather than a horizontal pivot, to ensure generic compatibility across varying semester subject loads.
- **Registration Number** (Required, Unique lookup)
- **Subject Code** (Required, maps to `Subject` and resolves `ProgramSubject`)
- **Internal Marks** (Optional, based on curriculum)
- **External Marks** (Optional)
- **Practical Marks** (Optional)
- **Other Marks** (Optional)
- **Total Marks** (Required if components are missing)
- **Grade** (Optional)

## 4. Manual Marks-Entry UX
- **Context Selector**: A stepped filter selection bar (Program → Curriculum → Session → Semester → Examination).
- **Entry Mode**: A spreadsheet-like data grid. Two views can be offered:
  - *By Student*: Expand a student to see all their subjects.
  - *By Subject*: Select a specific subject and enter marks for all students in a vertical list (typically faster for data entry operators).
- **Actions**: "Save as Draft", "Submit for Review", and "Publish" (with RBAC guards).

## 5. Integration Dependencies on Phase 9
- **Examination Entity**: We depend on Phase 9 to create and manage the `Examination` lifecycle. We must only query `Examination` records in valid states for marks entry.
- **Grading Rules**: We rely on Phase 9's population of `GradingScheme` and `ProgramSubject.componentConfiguration` to validate maximum marks and boundaries.
- **Re-exams**: Phase 9 will dictate the logic for `attemptNumber` and how supplementary examinations are linked to original registrations.

## 6. University-Policy Questions
- **Maximum Marks Validation**: Should validation hard-fail if marks exceed the maximum configured in the curriculum, or just warn?
- **Grades vs Marks**: If both grade and marks are uploaded, and they conflict according to the grading scheme, which takes precedence?
- **Calculations**: Does Docversity calculate SGPA/CGPA automatically on commit, or are these strictly provided by the external examination system?
- **Workflow**: Who holds the roles for `APPROVED` vs `PUBLISHED`? Can a single admin bypass review?

## 7. Database Integrity Risks
- **Triggers**: Bulk imports must not attempt to bypass `PUBLISHED` immutability triggers. The import worker must respect `publication_status`.
- **Concurrent Edits**: A manual edit happening simultaneously with an Excel commit could cause race conditions. We must use `FOR UPDATE` row locks or optimistic concurrency (`updatedAt`) during the commit phase.
- **Mismatch**: Entering marks for a subject not present in the student's `ProgramCurriculum` version. The database must strictly enforce `ResultItem.programSubjectId` against the student's assigned curriculum.

## 8. Testing Strategy
- **Unit Tests**: Test the boundary validations (marks > max marks, negative marks, missing required components).
- **Worker Tests**: Create synthetic `ImportRow` records to test the transition from `VALIDATING` to `VALIDATED` to `PROCESSING` for `RESULTS`.
- **Integration Tests**: E2E tests for the manual entry draft-to-publish workflow.
- **Security**: Verify that only authorized staff roles can trigger a state change to `PUBLISHED`.

## 9. Suggested Implementation Sequence
1. **Extend Import Types**: Add `RESULTS` to the import engine schemas and Enums.
2. **Validation Logic**: Implement `import.validate` for results, checking against `ProgramSubject` configurations.
3. **Commit Logic**: Implement `import.commit` to safely bulk-upsert `DRAFT` `Result` and `ResultItem` records.
4. **Manual API**: Develop backend endpoints for the manual marks entry grid.
5. **Frontend UI**: Build the UX for manual entry and extend the Import UI to support the new template mapping.
