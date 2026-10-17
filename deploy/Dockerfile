# Build on the target architecture; no host node_modules or credentials enter the context.
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=docversity14a-pnpm,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=docversity14a-pnpm,target=/root/.local/share/pnpm/store pnpm install --offline --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_URL=http://api:4000
RUN pnpm turbo run build --concurrency=2
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN pnpm --filter @docversity/documents exec playwright install chromium
RUN --mount=type=cache,id=docversity14a-pnpm,target=/root/.local/share/pnpm/store pnpm --filter @docversity/api deploy --legacy --prod /out/api && pnpm --filter @docversity/worker deploy --legacy --prod /out/worker

FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY deploy/scripts/launch.mjs /launch.mjs
USER node
ENTRYPOINT ["node", "/launch.mjs"]

FROM runtime AS api
USER root
RUN apt-get update && apt-get install -y --no-install-recommends libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 fonts-liberation && rm -rf /var/lib/apt/lists/*
USER node
COPY --from=build --chown=node:node /ms-playwright/ /ms-playwright/
COPY --from=build --chown=node:node /out/api/ ./
CMD ["node", "dist/main.js"]

FROM runtime AS worker
COPY --from=build --chown=node:node /out/worker/ ./
CMD ["node", "dist/main.js"]

FROM runtime AS web
COPY --from=build --chown=node:node /app/apps/web/.next/standalone/ ./
COPY --from=build --chown=node:node /app/apps/web/.next/static/ ./apps/web/.next/static/
ENV HOSTNAME=0.0.0.0 PORT=3000
CMD ["node", "apps/web/server.js"]

# One-shot operator tooling is never an application service or public listener.
FROM runtime AS tools
COPY --from=build --chown=node:node /app/node_modules/ ./node_modules/
COPY --from=build --chown=node:node /app/packages/ ./packages/
COPY --from=build --chown=node:node /app/apps/api/dist/ ./apps/api/dist/
COPY --from=build --chown=node:node /app/apps/api/node_modules/ ./apps/api/node_modules/
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/package.json ./package.json
CMD ["node", "packages/database/node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "packages/database/prisma.config.ts"]
