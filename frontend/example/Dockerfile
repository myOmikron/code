FROM node:24-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS build-frontend

WORKDIR /app

# Make pnpm non-interactive
ENV CI=true

# corepack install reads the pnpm version from the root package.json's
# "packageManager" field.
COPY ./package.json .
RUN corepack enable pnpm && corepack install

COPY ./ .

# Build context is the repo root: the app is a pnpm workspace member and needs
# the workspace manifest, lockfile, catalogs and the linked `components` package.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    <<EOF
set -e
pnpm config set store-dir /pnpm/store
pnpm install --frozen-lockfile
pnpm --dir frontend/example run build
mv frontend/example/dist /frontend
EOF


FROM nginx:latest@sha256:7f0adca1fc6c29c8dc49a2e90037a10ba20dc266baaed0988e9fb4d0d8b85ba0 AS final

COPY --from=build-frontend /frontend /usr/share/nginx/html
