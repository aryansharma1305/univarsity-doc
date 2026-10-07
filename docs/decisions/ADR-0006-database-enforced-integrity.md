# ADR-0006: Academic integrity rules are enforced by PostgreSQL

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

Docversity's core promises are that a **published result is never silently changed** and that a
certificate number or QR code always resolves to **one authoritative, unaltered record**. These records
will be written by several paths over the system's life: the API, the import worker, data-repair scripts,
the legacy WordPress migration and future admin tools. A rule enforced only in one service's code is only
as strong as the least careful writer.

Prisma's schema language cannot express partial unique indexes without a preview feature, CHECK
constraints or triggers.

## Decision

Enforce the integrity-critical rules **in the database**, in addition to (not instead of) application
validation:

- **Keys in `schema.prisma`**, including partial unique indexes via Prisma's `partialIndexes` preview
  feature (one PUBLISHED revision per attempt, one in-progress revision, one default template mapping)
  and composite foreign keys (certificate program = registration program; template type = mapping type).
- **CHECK constraints and triggers in the migration SQL**: value ranges, lifecycle field requirements,
  revision-chain rules, immutability of PUBLISHED/SUPERSEDED results and their items, immutability of
  ISSUED/REVOKED/SUPERSEDED/CANCELLED certificates, frozen ACTIVE templates and grading schemes,
  non-overlapping template mappings, and append-only audit/verification logs.
- All triggers raise **SQLSTATE `DV001`** with a guard-prefixed message, so applications can tell a
  business-rule violation apart from FK/unique errors (Prisma would otherwise report SQLSTATE 23001 as a
  foreign-key error).
- Partial-index predicates are written in PostgreSQL's normalised form so `prisma migrate dev` and
  `pnpm db:check` see no drift.
- Every invariant has a test against a disposable database built from the real migrations.

## Consequences

- Corrections are modelled as new revisions / replacement certificates, never as updates. Application
  workflows (Phases 7–10) must follow the documented transitions.
- Some rules live outside `schema.prisma`; `docs/database/README.md` is the catalogue, and schema changes
  must keep the SQL and the tests in step.
- A superuser can still disable triggers; data repair or legacy import that needs to must be a reviewed,
  audited procedure.
- The `partialIndexes` preview feature is a dependency; if Prisma changes it, the indexes can move to
  migration SQL (CHECK-like, invisible to diff) without changing behaviour.
