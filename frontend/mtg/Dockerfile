# The scanner's card index comes from its own image (built by
# frontend/mtg/index/Dockerfile on `mtg-index/v*` tags): computing it takes
# hours and must not run per app release. `:latest` on purpose — a frontend
# release picks up whatever index was refreshed last. The image lives on ghcr,
# so building this Dockerfile needs a `docker login ghcr.io`, and an
# `mtg-index/v*` tag must have been released once before the first build.
ARG CARD_INDEX_IMAGE=ghcr.io/myomikron/mtg-index/index:latest
FROM ${CARD_INDEX_IMAGE} AS card-index


FROM node:24-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS build-frontend

WORKDIR /app

# Make pnpm non-interactive
ENV CI=true

# corepack install reads the pnpm version from the root package.json's
# "packageManager" field.
COPY ./package.json .
RUN corepack enable pnpm && corepack install

# The packages, in a layer of their own. `pnpm fetch` reads the lockfile and
# the workspace file and nothing else, so the layer survives every commit that
# leaves those alone — which is what makes the release cache worth having.
# Fetching into the image is the point: BuildKit does not export `type=cache`
# mounts, so a store kept in one is gone by the next build.
COPY ./pnpm-lock.yaml ./pnpm-workspace.yaml ./
RUN <<EOF
set -e
pnpm config set store-dir /pnpm/store
pnpm fetch
EOF

COPY ./ .

# Build context is the repo root: the app is a pnpm workspace member and needs
# the workspace manifest, lockfile, catalogs and the linked `components` package.
# The self-hosted OCR runtime is copied out of the tesseract.js packages into
# public/ (see scripts/setup-ocr-assets.mjs) — the app never talks to a CDN.
RUN <<EOF
set -e
pnpm install --frozen-lockfile --offline
pnpm --dir frontend/mtg run ocr:assets
EOF

# The semver of the `mtg/v*` tag being released, handed down by
# release-docker.yaml. Left empty by any other build, in which case vite falls
# back to package.json — see the comment there. Declared this late on purpose:
# it changes with every release and would otherwise invalidate the steps above.
ARG APP_VERSION

RUN <<EOF
set -e
pnpm --dir frontend/mtg run build
mv frontend/mtg/dist /frontend
EOF


FROM nginx:latest@sha256:7f0adca1fc6c29c8dc49a2e90037a10ba20dc266baaed0988e9fb4d0d8b85ba0 AS final

COPY frontend/mtg/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-frontend /frontend /usr/share/nginx/html
# The card index the scanner matches against, served as static files under
# /data/all-card-index — the path the app fetches and the service worker caches.
COPY --from=card-index /data /usr/share/nginx/html/data
