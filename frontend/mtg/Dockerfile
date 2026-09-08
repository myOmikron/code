# The card index and the fine-tuned OCR models, which no build can produce: they come from ~450000
# reference scans and hours of training on the machine that holds them. Built and pushed by hand
# with `just mtg-assets`, pinned here so a release records which index it shipped.
ARG MTG_ASSETS_VERSION=v1
FROM ghcr.io/myomikron/mtg/assets:${MTG_ASSETS_VERSION} AS scanner-assets

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

# Ahead of the build, because vite copies public/ into dist/ wholesale. The root .dockerignore
# hides these two directories from the context on purpose: a working copy that happens to have
# them would otherwise stand in for the pinned image and hide the fact that a checkout has
# neither, which is how released images came to ship without a card index.
COPY --from=scanner-assets /data frontend/mtg/public/data
COPY --from=scanner-assets /tesseract frontend/mtg/public/tesseract

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
