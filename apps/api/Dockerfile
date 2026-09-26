# Build context: repository root (pnpm workspace).
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api... --ignore-scripts
COPY apps/api apps/api
RUN pnpm --filter api build
RUN pnpm --filter api deploy --prod --legacy /out && cp -r apps/api/dist apps/api/prisma apps/api/prisma.config.ts /out/

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 4000
# Same image runs both processes; compose overrides the command for the worker.
CMD ["node", "dist/main.js"]
