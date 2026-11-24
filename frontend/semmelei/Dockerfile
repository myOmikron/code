FROM node:26-bookworm-slim@sha256:0042e17d232a87a2cd485be1da7900fca4d10a4ad11b29e9285da1d2e54798c9 AS build-frontend

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
pnpm --dir frontend/semmelei run build
mv frontend/semmelei/dist /frontend
EOF


FROM nginx:1.31.9@sha256:84f7876d21d154885f99554d7ae325d8c2213f9169726ea7ab60642f2573a787 AS final

COPY frontend/semmelei/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-frontend /frontend /usr/share/nginx/html
