FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS build-frontend

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
pnpm --dir frontend/example run build
mv frontend/example/dist /frontend
EOF


FROM nginx:1.31.8@sha256:165ddde8751e75a1c907d24ef10d9f6deb08b57e0fe56caf67512486aff76d82 AS final

COPY --from=build-frontend /frontend /usr/share/nginx/html
