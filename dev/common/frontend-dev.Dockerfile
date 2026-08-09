FROM node:24-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c

WORKDIR /app

# wget + Java are needed by `just gen-api <name>`, which runs inside
# this container (fetches the OpenAPI spec, runs openapi-generator).
RUN <<EOF
set -e
apt-get update
apt-get install -y --no-install-recommends wget default-jre-headless
rm -rf /var/lib/apt/lists/*
EOF

# Make pnpm non-interactive
ENV CI=true

# The compose files run this container as 1000:1000 (the `node` user, which
# matches the host uid) so everything it writes into the bind-mounted workspace
# — node_modules, .vite, generated api clients — stays owned by the developer.
# Both caches therefore have to live outside root's home and be writable by it.
ENV HOME=/home/node
ENV COREPACK_HOME=/opt/corepack
ENV PNPM_HOME=/opt/pnpm

# corepack install reads the pnpm version from the root package.json's
# "packageManager" field.
COPY package.json .
RUN <<EOF
set -e
corepack enable pnpm
corepack install
mkdir -p "${PNPM_HOME}"
chown -R 1000:1000 "${COREPACK_HOME}" "${PNPM_HOME}" "${HOME}"
EOF

EXPOSE 5173

# The workspace is bind-mounted at /app by the dev compose file.
# FRONTEND selects which frontend/<name> to serve.
ENV FRONTEND=example
CMD ["sh", "-c", "pnpm install && pnpm --dir frontend/${FRONTEND} run dev"]
