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

# corepack install reads the pnpm version from the root package.json's
# "packageManager" field.
COPY package.json .
RUN corepack enable pnpm && corepack install

EXPOSE 5173

# The workspace is bind-mounted at /app by the dev compose file.
# FRONTEND selects which frontend/<name> to serve.
ENV FRONTEND=example
CMD ["sh", "-c", "pnpm install && pnpm --dir frontend/${FRONTEND} run dev"]
