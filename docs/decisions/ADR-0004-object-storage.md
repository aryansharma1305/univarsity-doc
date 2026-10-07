# ADR-0004: S3-compatible object storage — MinIO locally, R2 or S3 in production

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

Docversity will store uploaded spreadsheets, generated error reports, issued PDFs, template assets
(seals, signatures) and possibly student photos. These must be private, durable and served only through
authorised, short-lived links. The production provider (Cloudflare R2 or AWS S3) is not finalised, and
local development must not depend on a cloud account.

## Decision

- All code talks to storage through an **`ObjectStorage` port** (`apps/api/src/storage/object-storage.ts`);
  the only implementation is `S3ObjectStorage` built on the AWS SDK v3 S3 client.
- Providers differ **only in configuration**:

  | Variable                                      | MinIO (local)            | Cloudflare R2                                | AWS S3              |
  | --------------------------------------------- | ------------------------ | -------------------------------------------- | ------------------- |
  | `S3_ENDPOINT`                                 | `http://127.0.0.1:59000` | `https://<account>.r2.cloudflarestorage.com` | unset               |
  | `S3_REGION`                                   | `us-east-1`              | `auto`                                       | the bucket's region |
  | `S3_FORCE_PATH_STYLE`                         | `true`                   | `false`                                      | `false`             |
  | `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | local app user           | R2 API token                                 | IAM user/role       |

- **Locally, MinIO runs in Docker Compose.** On start it creates a **private** bucket and a
  **least-privilege application user** whose policy allows only `ListBucket`/`GetBucketLocation` on the
  bucket and `Get/Put/DeleteObject` on its objects. The apps never use the MinIO root account.
- Buckets are private; files will be delivered through presigned URLs with short expiry issued after an
  authorisation check. No public ACLs.
- Health is checked with `HeadBucket`, which proves endpoint reachability, credentials and bucket existence
  without touching objects.

## MinIO image source

MinIO stopped publishing community images to Docker Hub and Quay in late 2025 (`minio/minio` no longer
exists on Docker Hub; Quay requires authentication). The compose file uses **Chainguard's maintained build
of MinIO from source** (`cgr.dev/chainguard/minio`), which also contains `mc`, **pinned by digest** for
reproducibility. Chainguard's free tier publishes only the `latest` tag, so updating means pulling the new
`latest`, testing, and updating the digest. If this image becomes unavailable, any S3-compatible server
(e.g. a self-built MinIO image) can replace it without code changes.

## Consequences

- Switching MinIO → R2/S3 is a configuration change; no business service changes.
- Provider-specific features (R2 custom domains, S3 Object Lock) are not used unless an ADR adopts them.
- Object operations (put/get/presign/delete) are added to the port when the first feature needs them;
  Phase 1 exposes only `ping()`.
