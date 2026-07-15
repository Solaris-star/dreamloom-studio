# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile
# - target:deps  shared install
# - target:dev   local development (Vite dev server) — used by docker-compose.yml
# - target:build production static build
# - target:prod  production runtime (no Vite dev server; vite preview + API middleware)
#
# Build production image:
#   docker build --target prod -t dreamloom-studio:prod .
#
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS dev
COPY . .
EXPOSE 5174 8787
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5174"]

FROM deps AS build
COPY . .
# Skip prebuild unit/api suite inside image builds; CI runs those separately.
RUN npx vite --config vite.web.config.mjs build

# Production runtime:
# - static assets from build
# - server sources for /api middleware (configurePreviewServer)
# - node_modules from build (includes vite preview toolchain)
# - does NOT run Vite development server
FROM node:24-bookworm-slim AS prod
WORKDIR /app

ENV NODE_ENV=production \
    NOVEL_BOOKS_DIR=/data/books \
    WEB_HOST=0.0.0.0 \
    WEB_PORT=5174 \
    AGENT_TASK_WS_HOST=0.0.0.0 \
    AGENT_TASK_WS_PORT=8787 \
    AGENT_TASK_QUEUE_ENABLED=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    HOME=/tmp

RUN groupadd --system --gid 10001 dreamloom \
  && useradd --system --uid 10001 --gid dreamloom --home-dir /app --shell /usr/sbin/nologin dreamloom \
  && mkdir -p /data/books /data/store /tmp \
  && chown -R dreamloom:dreamloom /app /data /tmp

# Runtime tree from the build stage (locked deps + built assets + sources already in build context)
COPY --from=build --chown=dreamloom:dreamloom /app/package.json /app/package-lock.json ./
COPY --from=build --chown=dreamloom:dreamloom /app/node_modules ./node_modules
COPY --from=build --chown=dreamloom:dreamloom /app/dist-web ./dist-web
COPY --from=build --chown=dreamloom:dreamloom /app/bin ./bin
COPY --from=build --chown=dreamloom:dreamloom /app/src ./src
COPY --from=build --chown=dreamloom:dreamloom /app/resources ./resources
COPY --from=build --chown=dreamloom:dreamloom /app/static ./static
COPY --from=build --chown=dreamloom:dreamloom /app/vite.web.config.mjs /app/vite.web.plugins.mjs ./
COPY --chown=dreamloom:dreamloom scripts/start-web.mjs scripts/start-worker.mjs ./scripts/
COPY --chown=dreamloom:dreamloom deploy/entrypoint.sh /entrypoint.sh

# Bake store symlink + vite temp dir so read_only rootfs never needs to write under /app.
# Vite preview writes bundled config into node_modules/.vite-temp; point it at /tmp.
RUN ln -sfn /data/store/.store.json /app/.store.json \
  && rm -rf /app/node_modules/.vite-temp \
  && ln -sfn /tmp/vite-temp /app/node_modules/.vite-temp \
  && chmod +x /entrypoint.sh bin/novel.js scripts/start-web.mjs scripts/start-worker.mjs \
  && test -f /app/node_modules/vite/bin/vite.js \
  && chown -R dreamloom:dreamloom /app /data

USER dreamloom

EXPOSE 5174 8787
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.WEB_PORT||5174)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "scripts/start-web.mjs"]
