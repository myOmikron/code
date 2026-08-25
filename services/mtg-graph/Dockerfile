# Build context is the workspace root, like the Rust services:
#   docker build -f services/mtg-graph/Dockerfile .
FROM ghcr.io/astral-sh/uv:python3.14-trixie-slim AS build

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Dependencies first, so source edits don't bust this layer.
COPY services/mtg-graph/pyproject.toml services/mtg-graph/uv.lock ./
RUN uv sync --locked --no-install-project --no-dev \
    --extra api --extra solver --extra edhrec

COPY services/mtg-graph/src ./src
COPY services/mtg-graph/README.md ./
RUN uv sync --locked --no-dev --extra api --extra solver --extra edhrec

# Not dhi.io/alpine-base like the Rust services: ortools only ships manylinux
# (glibc) wheels, so the runtime has to stay Debian-based.
FROM python:3.14-slim-trixie

RUN <<EOF
set -e
groupadd --system app
useradd --system --gid app --no-create-home --home /app app
# Bulk dumps and the EDHREC cache; mounted as a volume in the compose stacks.
mkdir /data
chown app:app /data
EOF

COPY --from=build --chown=app:app /app /app
COPY --chmod=755 services/mtg-graph/scripts/entrypoint.sh /entrypoint.sh

ENV PATH=/app/.venv/bin:$PATH
ENV DATA_DIR=/data

USER app
WORKDIR /app
EXPOSE 8000

# Ingests the corpus on first start and skips it on every start after, so a
# fresh stack serves a graph with data in it rather than an advisor reporting
# zeroes. BOOTSTRAP_ON_START=false turns it off. GRAPH_RUNNER stays unset here:
# the venv is on PATH in this image.
ENTRYPOINT ["/entrypoint.sh"]

# --root-path matches the public /api/graph prefix under which the mtg
# webserver proxies us; it keeps the generated OpenAPI's base path right.
CMD ["uvicorn", "deck_lab.api:app", "--host", "0.0.0.0", "--port", "8000", "--root-path", "/api/graph"]
