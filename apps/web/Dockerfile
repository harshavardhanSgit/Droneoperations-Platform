# The web app. Context is the REPO ROOT — see the note in apps/api/Dockerfile.

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

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci

# ---------------------------------------------------------------------- build
FROM node:20-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web

# NEXT_PUBLIC_* is inlined into the bundle at BUILD time, not read at runtime —
# so this has to be a build argument. Passing it as a runtime environment
# variable would ship a bundle whose API host is literally `undefined`, which
# is the failure that once made a deployed frontend call localhost.
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Switches next.config.ts to `output: standalone` — see the comment there for
# why it is gated rather than always on.
ENV DOCKER_BUILD=1

RUN npm run build --workspace @drone-ops/web

# -------------------------------------------------------------------- runtime
FROM node:20-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3010
# Without this Next binds to localhost INSIDE the container, which is
# unreachable from the host however the ports are published.
ENV HOSTNAME=0.0.0.0

# standalone already contains the traced node_modules and its own server.js,
# so nothing else is copied. `static` and `public` are not traced — Next
# expects them beside the server, and without them every asset 404s.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3010

CMD ["node", "apps/web/server.js"]
