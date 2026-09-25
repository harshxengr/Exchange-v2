FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN corepack enable && \
    corepack prepare pnpm@10.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile

# Prisma 7 reads DATABASE_URL from prisma.config.ts even during
# client generation, so provide a non-secret build-time placeholder.
ENV DATABASE_URL=postgresql://exchange:exchange@localhost:5432/exchange

RUN pnpm --filter @exchange/db db:generate

FROM base AS api

RUN pnpm --filter @exchange/domain build && \
    pnpm --filter @exchange/messaging build && \
    pnpm --filter @exchange/db build && \
    pnpm --filter @exchange/api build

EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]

FROM base AS engine

RUN pnpm --filter @exchange/domain build && \
    pnpm --filter @exchange/messaging build && \
    pnpm --filter @exchange/engine build

CMD ["node", "apps/engine/dist/index.js"]

FROM base AS worker

RUN pnpm --filter @exchange/domain build && \
    pnpm --filter @exchange/messaging build && \
    pnpm --filter @exchange/db build && \
    pnpm --filter @exchange/worker build

CMD ["node", "apps/worker/dist/index.js"]

FROM base AS web-build

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NODE_ENV=production

RUN pnpm --filter @exchange/web build

FROM web-build AS web

EXPOSE 3000

CMD ["pnpm", "--filter", "@exchange/web", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
