# The scanner's card index (~430 MB of perceptual signatures), packaged as its
# own image so the frontend can copy it in at build time. Building it means
# downloading Scryfall's default-cards bulk data plus every card image and
# computing signatures — an hours-long job that must not run on every frontend
# release. It runs only when a `mtg-index/v*` tag is pushed (see
# docker/mtg-index.yaml), which is how the index is refreshed for new sets.
#
# This file deliberately lives one directory below frontend/mtg so the
# Dockerfile Build Check (docker-build.yaml) never picks it up on a PR — a PR
# must not spend hours rebuilding an index.
FROM node:24-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS build-index

WORKDIR /app

# Make pnpm non-interactive
ENV CI=true

# corepack install reads the pnpm version from the root package.json's
# "packageManager" field.
COPY ./package.json .
RUN corepack enable pnpm && corepack install

COPY ./pnpm-lock.yaml ./pnpm-workspace.yaml ./
RUN <<EOF
set -e
pnpm config set store-dir /pnpm/store
pnpm fetch
EOF

COPY ./ .

RUN pnpm install --frozen-lockfile --offline

# The release version, handed down by release-docker.yaml. Declared before the
# build step ON PURPOSE: a new tag changes the ARG and busts the layer cache,
# which is exactly what a release of this image is for — recomputing against
# Scryfall's current data. Without a new tag the cached layer is reused and no
# rebuild happens.
ARG APP_VERSION

# The bulk json and the card images land in .cache; the cache mount keeps them
# (and with them, incremental rebuilds via the shard cache) on hosts whose
# BuildKit state survives between builds. CI runners start cold and simply
# download everything.
RUN --mount=type=cache,target=/app/frontend/mtg/.cache <<EOF
set -e
pnpm --dir frontend/mtg run index:build
mv frontend/mtg/public/data/all-card-index /all-card-index
EOF


# Data-only image: never run, only a `COPY --from` source for frontend/mtg's
# Dockerfile.
FROM scratch AS final

COPY --from=build-index /all-card-index /data/all-card-index
