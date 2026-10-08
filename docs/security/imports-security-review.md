# Security review — student imports (Phase 5)

Scope: `POST/GET /api/v1/imports*`, the import worker, private storage, the import UI. Reviewed against
the Phase 3 security model. Result: **no open high/medium findings**; residual risks listed at the end.

| Area                           | Control                                                                                                                                                                                                                | Verified by                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Authentication & authorisation | Global Auth → CSRF → Permissions guards run before the upload is buffered; `imports.students.run` / `imports.read`; commit additionally needs `students.write` + `registrations.write`; EXAM_ADMIN and VIEWER denied   | `apps/api/test/imports/security.test.ts`, permissions tests |
| CSRF                           | Session HMAC token on every unsafe import endpoint, including multipart upload                                                                                                                                         | security tests                                              |
| Upload limits                  | Size enforced while streaming (413); one file, few small fields; proxy limit = API limit + 1 MB                                                                                                                        | security tests                                              |
| File type                      | Extension + MIME allow-list + real ZIP/workbook structure; legacy/encrypted workbooks recognised                                                                                                                       | security + container tests                                  |
| Zip bombs / malformed archives | Declared uncompressed total capped; worker inflates every entry with a hard output cap before ExcelJS; ZIP64/encrypted/unknown compression rejected                                                                    | container tests                                             |
| Path traversal                 | No disk writes; UUID-only object keys; filename sanitised display text                                                                                                                                                 | storage + security tests                                    |
| Formula injection              | Formulas never evaluated (`FORMULA_NOT_ALLOWED`); report text beginning `= + - @ \t \r` is apostrophe-prefixed                                                                                                         | engine tests                                                |
| Data minimisation              | Identity-number columns (national ID, Aadhaar, passport, PAN…) never mappable, dropped before validation, absent from staging rows, previews, reports, audit; distinct values collected only for category-like columns | registration-2025 tests (engine + API)                      |
| Private storage                | Bucket private; no presigned URLs; downloads streamed after a permission check with `no-store`; anonymous bucket access returns 403                                                                                    | security tests                                              |
| Idempotency & integrity        | Compare-and-set transitions, run ownership, row-locked batches, unique registration index, commit-time re-checks                                                                                                       | commit tests                                                |
| Error handling                 | Safe messages only; no stack traces/SQL in API responses, failures, reports                                                                                                                                            | flow + commit tests                                         |
| Audit                          | Every step and every created/updated record; metadata = IDs, counts, field names                                                                                                                                       | flow tests                                                  |

Residual risks / follow-ups:

1. The original workbook (which may contain national IDs) stays in private storage until retention
   cleanup, which is documented but **not automated** yet — implement before production imports.
2. Header-based identity-column detection is a pattern list; an identity column with an unusual header
   would not be flagged. It still can only be imported if mapped to a field, and no field accepts it by
   default. Review headers during mapping.
3. ExcelJS 4.4.0 is the latest release but old; parsing happens only after the container checks, in the
   worker process, with limits.
4. Student-facing features (accounts, uploads by students) are out of scope here and get their own review.
