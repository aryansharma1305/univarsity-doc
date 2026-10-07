# apps/web/src

| Folder        | Holds                                                                            | Phase 1                      |
| ------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| `app/`        | Next.js App Router routes. Planned route groups: `(public)`, `(auth)`, `(admin)` | Development status page only |
| `components/` | App-level layout components (PublicShell, AdminShell)                            | Empty                        |
| `features/`   | Feature modules (`verification`, `results`, `imports`, `certificates`, …)        | Empty                        |
| `lib/`        | Framework-agnostic helpers: env, API access                                      | `env.ts`, `api-health.ts`    |
| `hooks/`      | Shared React hooks                                                               | Empty                        |
| `styles/`     | Global CSS / Tailwind entry                                                      | Tailwind defaults only       |

Folders are intentionally empty until real features exist — no placeholder components.
