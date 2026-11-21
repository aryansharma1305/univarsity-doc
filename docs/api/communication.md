# Chat & Communication API

All responses `Cache-Control: no-store`. Unsafe methods need `X-CSRF-Token`. See ADR-0025.

## Student (student session)

| Method     | Path                                           | Notes                                                            |
| ---------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| GET        | `/student/messages`                            | Own threads (`status`, `unread=true`, paging)                    |
| POST       | `/student/messages`                            | `{ subject, body }` → thread (201)                               |
| GET        | `/student/messages/:id`                        | Own thread; marks it read                                        |
| POST       | `/student/messages/:id/replies`                | `{ body }`; reopens a resolved thread                            |
| GET        | `/student/notifications`                       | Own notifications (`unread=true`, paging)                        |
| GET        | `/student/notifications/unread-count`          | `{ unread }`                                                     |
| POST       | `/student/notifications/:id/read`, `/read-all` | Own only (404 otherwise)                                         |
| GET / POST | `/student/verification-queries`                | Own queries / submit `{ category, documentReference?, message }` |

## Staff

| Method     | Path                                                                                               | Permission                    |
| ---------- | -------------------------------------------------------------------------------------------------- | ----------------------------- |
| GET        | `/messages`, `/messages/:id`                                                                       | `studentMessages.read`        |
| POST       | `/messages/:id/replies`, `/resolve`, `/reopen`                                                     | `studentMessages.respond`     |
| GET        | `/verification-queries`, `/verification-queries/:id`                                               | `verificationQueries.read`    |
| POST       | `/verification-queries/:id/respond` (`{ response, resolve, version }`), `/resolve` (`{ version }`) | `verificationQueries.respond` |
| GET / POST | `/notifications`, `/unread-count`, `/:id/read`, `/read-all`                                        | any staff (own rows)          |

## Public (no account; pre-auth CSRF from `/student-auth/csrf`)

| Method | Path                                  | Notes                                                                                                                                                        |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/public/verification-queries`        | `{ requesterName, organization?, contactEmail?, category, documentReference?, message }` → `{ reference, accessCode, status }` (code shown once); 5/h per IP |
| POST   | `/public/verification-queries/status` | `{ reference, accessCode }` → the query and answer; identical 404 for any miss                                                                               |
