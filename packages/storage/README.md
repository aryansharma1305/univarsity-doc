# @docversity/storage

Private object storage behind a provider-neutral port (`ObjectStorage`), shared by the API and the worker.

- `S3ObjectStorage` — the only production implementation (MinIO locally, Cloudflare R2 or AWS S3 by
  configuration; see [ADR-0004](../../docs/decisions/ADR-0004-object-storage.md)).
- `objectKeys` — generated object keys. Keys are built from fixed prefixes and generated UUIDs only; an
  uploaded file's name is display metadata and never part of a key.
- `MemoryObjectStorage` — in-memory implementation for unit tests.

Buckets are private. Files reach users only through authorised API endpoints that stream them after a
permission check — never through public URLs.
