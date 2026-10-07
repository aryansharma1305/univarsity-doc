# @docversity/types

Shared TypeScript types and constants that need **no runtime validation** (e.g. queue names).

Types that describe validated data (API payloads, job payloads, environment) are inferred from the Zod
schemas in `@docversity/validation` instead of being written twice.
