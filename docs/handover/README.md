# University handover documentation

- **Audience:** university administration, Registrar's office, examination and certificate staff,
  the operator who runs the production server.
- **Scope:** what the released system does, who may do it, how to operate and verify it, and what
  the university still has to decide.
- **Applies to release `916b07c`** (main, running at https://verify.thedocversity.com).

Everything here is checked against the code, tests, ADRs and existing docs in this repository. Where
a statement could not be checked in the repository it says **not verified**. Work in open pull
requests #60–#63 is described only in sections labelled **Merged, deploys with the next release**.

| Document                                                                                             | Purpose                                                                     |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [admin-panel-user-guide.md](admin-panel-user-guide.md)                                               | Every Admin Panel page by navigation group: permission, tasks, gates        |
| [student-portal-user-guide.md](student-portal-user-guide.md)                                         | Every Student Portal page: what a student can see and do                    |
| [staff-roles-and-permissions.md](staff-roles-and-permissions.md)                                     | Role × permission table from `ROLE_PERMISSIONS`; separation-of-duties rules |
| [registration-and-result-import-guide.md](registration-and-result-import-guide.md)                   | Registration (student) Excel import and result import preview/draft save    |
| [examination-and-certificate-workflow-guide.md](examination-and-certificate-workflow-guide.md)       | Examinations, re-exams, payments, marks review, official documents          |
| [public-verification-and-qr-activation-guide.md](public-verification-and-qr-activation-guide.md)     | Four public services, allowlists, QR, two-person policy procedure, flag     |
| [production-deployment-and-rollback-runbook.md](production-deployment-and-rollback-runbook.md)       | VPS release procedure, image-only rollback                                  |
| [backup-restore-monitoring-security-operations.md](backup-restore-monitoring-security-operations.md) | Backups, restore tests, monitoring, SSH, key custody, CSP                   |
| [functional-acceptance-test-matrix.md](functional-acceptance-test-matrix.md)                         | Automated test coverage per module and role-based UAT cases                 |
| [university-decisions-and-known-limitations.md](university-decisions-and-known-limitations.md)       | Open university decisions and current limitations                           |
| [release-notes.md](release-notes.md)                                                                 | Releases `0071bdb`, `21d9146`, `916b07c`; pending PRs #60–#63               |
| [handover-signoff-checklist.md](handover-signoff-checklist.md)                                       | University-owned actions, sign-offs and operator responsibilities           |

Conventions: permission names are written as in `packages/types/src/permissions.ts` (for example
`results.write`). Paths such as `/admin/results` are relative to the production origin. All examples
use synthetic data only.
