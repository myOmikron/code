FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build-frontend

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
RUN <<EOF
set -e
pnpm install --frozen-lockfile --offline
pnpm --dir frontend/bnv-manager-v2 run build
mv frontend/bnv-manager-v2/dist /frontend
EOF


FROM nginx:1.31.9@sha256:08f354a3b44c422021a5c0f5efb3e27f8f90236b5447d3bac4053f5f50ab6760 AS final

COPY frontend/bnv-manager-v2/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-frontend /frontend /usr/share/nginx/html
