# @docversity/config

Shared tooling configuration. Contains **no runtime code**.

| Export                                      | Use                                                              |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `@docversity/config/typescript/base.json`   | Strict compiler defaults shared by every package                 |
| `@docversity/config/typescript/node.json`   | Native ESM Node.js (`NodeNext`) — shared packages, worker        |
| `@docversity/config/typescript/nestjs.json` | Node + decorator metadata — `apps/api`                           |
| `@docversity/config/typescript/nextjs.json` | Bundler resolution + JSX — `apps/web`                            |
| `@docversity/config/eslint/base`            | Type-aware TypeScript rules + Prettier compatibility             |
| `@docversity/config/eslint/node`            | Base + Node globals (`nestjs: true` relaxes rules Nest DI needs) |
| `@docversity/config/eslint/nextjs`          | Base + React, hooks, jsx-a11y and Next.js rules                  |

Formatting is owned by Prettier (root `.prettierrc.json`); ESLint never reports formatting.
