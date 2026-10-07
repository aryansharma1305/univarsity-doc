# ADR-0003: Long-running work runs in a BullMQ worker

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

Several upcoming tasks are too slow or heavy for an HTTP request:

- **Excel validation** — parsing thousands of rows and checking each against the database.
- **Excel imports** — committing thousands of rows in chunked transactions.
- **PDF generation** — headless Chromium (Playwright) rendering of results, transcripts and certificates,
  individually and in bulk.

Doing these inside API requests would hit proxy/browser timeouts, block API resources, lose work on a
restart, and make the API container carry Chromium.

## Decision

Run long-running work in a **separate worker application (`apps/worker`) using BullMQ on Redis**.

- The API validates the request, persists the intent (e.g. an `imports` row), enqueues a job and returns
  immediately; the UI polls status.
- The worker consumes jobs, reads/writes PostgreSQL and object storage, and records progress/results.
- Jobs are idempotent, retried with backoff where safe, and fail loudly (unknown job names are rejected).
- Phase 1 implements only the infrastructure `health-test` job on the `system` queue to prove the path.

## Rationale

- BullMQ is mature, Redis-backed (Redis is already required), and supports retries, backoff, concurrency
  limits, delayed jobs, progress and job events.
- A separate process isolates CPU/memory-heavy work (Chromium) from request latency and lets the worker
  scale independently.
- Only the worker image needs Chromium and spreadsheet tooling.

## Consequences

- One more process to run and monitor (`pnpm dev` starts it locally).
- Job payloads are validated with Zod schemas shared via `@docversity/validation`; queue/job names live in
  `@docversity/types`.
- Jobs must be designed for at-least-once delivery (idempotent writes keyed by import id + row number,
  etc.).
- Tests isolate themselves with a unique Redis key prefix so they never interfere with a running worker.
