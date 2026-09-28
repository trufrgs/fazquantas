# syntax=docker/dockerfile:1
# Imagem única: o servidor Node serve o web (build do Vite) e o multiplayer (socket.io) na mesma porta.

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @fodinha/web build && pnpm --filter @fodinha/server build
# Só as dependências de produção do servidor (socket.io, zod); o engine já vai no bundle.
RUN pnpm --filter @fodinha/server deploy --prod /out/server

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/web
COPY --from=build /out/server/node_modules ./node_modules
COPY --from=build /out/server/package.json ./package.json
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/web/dist ./web
EXPOSE 3001
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/health" || exit 1
CMD ["node", "dist/index.js"]
