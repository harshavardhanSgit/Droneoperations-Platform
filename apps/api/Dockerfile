# The API, built in stages so the shipped image carries no compiler and no
# dev dependencies.
#
# Context is the REPO ROOT, not this directory — npm workspaces hoist every
# dependency into the root node_modules, so a build scoped to apps/api would
# resolve nothing. See docker-compose.yml, which sets `context: .`.

# ---------------------------------------------------------------- dependencies
# Debian slim rather than alpine, and a toolchain in THIS stage only.
#
# argon2 is a native module with no prebuilt binary for linux/arm64, so npm
# compiles it from source wherever this is built — on an Apple Silicon machine
# that is every time. node-gyp needs python3, make and a C++ compiler to do it.
#
# They are installed here and in the build stage, never in the runtime one:
# the shipped image needs the compiled .node file, not the compiler that
# produced it.
FROM node:20-slim AS deps
WORKDIR /app

# node-gyp's dependencies, for argon2. --no-install-recommends keeps this to
# what is actually needed; the layer is discarded before the runtime stage.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Manifests only, before any source. Docker caches this layer on their hashes,
# so editing a controller does not re-run a two-minute npm ci.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Dev dependencies are needed HERE: nest build, the TypeScript compiler and the
# Prisma CLI all live in devDependencies. They are dropped in the runtime stage.
RUN npm ci

# ---------------------------------------------------------------------- build
FROM node:20-slim AS build
WORKDIR /app

# node-gyp's dependencies, for argon2. --no-install-recommends keeps this to
# what is actually needed; the layer is discarded before the runtime stage.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json package-lock.json ./
COPY apps/api ./apps/api

# `npm run build` in this workspace is `prisma generate && nest build`. The
# generate half is not optional: the client is git-ignored build output, so
# without it nothing compiles.
RUN npm run build --workspace @drone-ops/api

# ---------------------------------------------------------------------- prune
# Its own stage so `build` still has the dev dependencies in it. That makes the
# build stage runnable — `docker build --target build` then `npm run api:test`
# reproduces a Linux CI run on any machine, which is how the one CI failure
# this pipeline caught was diagnosed.
FROM build AS prune
WORKDIR /app

RUN npm ci --omit=dev

# -------------------------------------------------------------------- runtime
FROM node:20-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

# A non-root user. The node images ship one already, so this is a chown and a
# USER line rather than a useradd — but it matters: a container process running
# as root is one container escape away from root on the host.
COPY --from=prune --chown=node:node /app/node_modules ./node_modules
COPY --from=prune --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prune --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=prune --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=prune --chown=node:node /app/apps/api/package.json ./apps/api/
COPY --from=prune --chown=node:node /app/apps/api/prisma.config.ts ./apps/api/
COPY --from=prune --chown=node:node /app/package.json ./

# Uploads land here when STORAGE_LOCAL_DIR is used. Created and owned up front,
# because a process that cannot write its own storage directory fails at the
# first upload rather than at boot, which is far harder to diagnose.
RUN mkdir -p /app/apps/api/.storage && chown -R node:node /app/apps/api/.storage

USER node
WORKDIR /app/apps/api

EXPOSE 3000

# Migrations run on start, not at build time: a build has no database, and the
# schema must be in step with the code that is about to serve traffic. This
# mirrors what the plan specifies for the hosted deploy.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
