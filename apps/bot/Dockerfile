FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS build
WORKDIR /app

# Kopiuj root config monorepo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc turbo.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/bot/package.json ./apps/bot/package.json
COPY apps/dashboard/package.json ./apps/dashboard/package.json

RUN pnpm install --frozen-lockfile

# Kopiuj źródła
COPY packages/shared/ ./packages/shared/
COPY apps/bot/tsconfig.json ./apps/bot/tsconfig.json
COPY apps/bot/src/ ./apps/bot/src/
COPY apps/dashboard/ ./apps/dashboard/

# Build shared + bot + dashboard
RUN pnpm turbo build

FROM base AS runtime
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/bot/package.json ./apps/bot/package.json

RUN pnpm install --frozen-lockfile --prod

# Kopiuj skompilowane pliki
COPY --from=build /app/packages/shared/dist/ ./packages/shared/dist/
COPY --from=build /app/apps/bot/dist/ ./apps/bot/dist/
COPY --from=build /app/apps/dashboard/dist/ ./apps/dashboard/dist/
COPY apps/bot/knowledge/ ./apps/bot/knowledge/

USER node

CMD ["node", "apps/bot/dist/src/index.js"]
