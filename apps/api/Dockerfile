# Build context: repository root (pnpm workspace).
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api... --ignore-scripts
COPY apps/api apps/api
RUN pnpm --filter api build
# Production-only node_modules, then the compiled app (dist includes the generated Prisma client).
RUN pnpm --filter api deploy --prod --legacy --ignore-scripts /out \
 && rm -rf /out/dist /out/src \
 && cp -r apps/api/dist /out/dist

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out .
USER node
EXPOSE 4000
# Same image runs both processes; compose overrides the command for the worker.
CMD ["node", "dist/main.js"]
