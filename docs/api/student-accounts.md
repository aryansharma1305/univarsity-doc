# Student portal & student accounts API

Architecture: [authentication — student portal](../architecture/authentication.md#student-portal-authentication-phase-6).

## Student endpoints (student session; never staff)

| Method & path                        | Purpose                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/student-auth/csrf`      | CSRF token (student session token, or pre-auth token + cookie)                                                                                                                     |
| `POST /api/v1/student-auth/activate` | `{ registrationNumber, activationCode, password }` → signs in, returns `StudentMe`. Failures: `400 STUDENT_ACTIVATION_FAILED` (always the same), `400 AUTH_PASSWORD_POLICY`, `429` |
| `POST /api/v1/student-auth/login`    | `{ registrationNumber, password }` → `StudentMe`. Failures: `401 AUTH_INVALID_CREDENTIALS`, `429`                                                                                  |
| `POST /api/v1/student-auth/logout`   | Ends the student session                                                                                                                                                           |
| `GET /api/v1/student/me`             | The signed-in student's own profile and registrations (`StudentMe`)                                                                                                                |

## Staff endpoints

| Method & path                                           | Permission               | Purpose                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/student-accounts`                          | `studentAccounts.read`   | Registrations with portal state. Query: `search`, `state` (`NO_ACCOUNT`, `CODE_ISSUED`, `CODE_EXPIRED`, `ACTIVE`, `LOCKED`, `DISABLED`), `programId`, `academicSessionId`, `importJobId`, paging, `sortBy` (`registrationNumber`, `studentName`) |
| `POST /api/v1/student-accounts/activation-codes`        | `studentAccounts.manage` | `{ registrationIds: uuid[≤500] }` or `{ importJobId }` (≤ 2,000). Returns `{ issued: [{ registrationNumber, studentName, programCode, code, expiresAt }], skipped: [{ registrationNumber, reason }] }` — plain codes appear **only here**        |
| `POST /api/v1/student-accounts/activation-codes/revoke` | `studentAccounts.manage` | `{ registrationIds }` → `{ revoked }`                                                                                                                                                                                                            |
| `POST /api/v1/student-accounts/:accountId/status`       | `studentAccounts.manage` | `{ status: ACTIVE\|LOCKED\|DISABLED, reason }` (reason required for DISABLED); ends sessions unless ACTIVE                                                                                                                                       |

Audit actions: `STUDENT_ACTIVATION_CODE_ISSUED`, `STUDENT_ACTIVATION_CODE_REVOKED`,
`STUDENT_ACTIVATION_FAILED`, `STUDENT_ACCOUNT_ACTIVATED` (`recovery: true|false`),
`STUDENT_LOGIN_SUCCESS`, `STUDENT_LOGIN_FAILURE`, `STUDENT_LOGOUT`, `STUDENT_ACCOUNT_STATUS_CHANGED`.
Metadata never contains codes, passwords, raw registration numbers of failed attempts or raw IPs.
