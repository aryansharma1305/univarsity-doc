# @docversity/validation

Zod schemas shared across the monorepo. One schema is the single source for:

- runtime validation (API pipes, worker job payloads, web forms later),
- inferred TypeScript types (`z.infer`), and
- OpenAPI documentation (NestJS Swagger reads Zod's Standard JSON Schema directly).

Phase 1 contains **infrastructure schemas only**: environment variables, the `GET /health` contract and
the BullMQ `health-test` job. Business schemas (students, results, certificates, imports) arrive with
their features — none are stubbed here.
