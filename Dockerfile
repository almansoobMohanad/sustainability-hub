# syntax=docker/dockerfile:1

# The whole product in one image: the API serves the app and /api on one port.
#   docker build -t sustainability-hub .
#   docker run -p 3000:3000 --env-file <settings> sustainability-hub
# Settings (DATABASE_URL, APP_URL, BETTER_AUTH_SECRET, SMTP_URL, ...) come from
# the environment at run time, never from files baked into the image
# (.dockerignore keeps .env files and certificates out of the build).

# ---- 1. Build: install everything, build the app and bundle the API ----
FROM node:26-alpine AS build
RUN npm install --global pnpm@12.18.0
WORKDIR /repo

# Package lists first: this layer (the slow install) is reused while only source code changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
COPY apps/site/package.json apps/site/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
# Only what the app and the API need (the website isn't part of the image)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@hub/app..." --filter "@hub/api..."

COPY . .

# Address of the public website for "Back to website" (no link when empty)
ARG VITE_SITE_URL=""
ENV VITE_SITE_URL=$VITE_SITE_URL
# The git commit being built, reported by /api/health (--build-arg HUB_VERSION=<commit>)
ARG HUB_VERSION=""
ENV HUB_VERSION=$HUB_VERSION
RUN pnpm --filter @hub/app build \
 && node scripts/precompress.mjs apps/app/dist \
 && pnpm --filter @hub/api build

# ---- 2. Run: Node plus the bundled API (no node_modules) and the built app ----
FROM node:26-alpine
# NO_COLOR: plain request logs (hosting dashboards would show colour codes as text)
ENV NO_COLOR=1
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    APP_FILES_DIR=/app/public
WORKDIR /app
COPY --from=build /repo/apps/api/dist ./
COPY --from=build /repo/apps/app/dist ./public

# Never run as root inside the container
USER node
EXPOSE 3000
# For `docker run` / Docker Compose (Render uses its own check of /api/health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "index.mjs"]
