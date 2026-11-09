# Build context is the workspace root, like the Rust services:
#   docker build -f services/mtg-graph/Dockerfile .
FROM ghcr.io/astral-sh/uv:0.13.7-python3.14-trixie-slim@sha256:e80c05a310400cfc90af00b5b7271ef9ad24816e3265e1162af8a678e1aad099 AS build

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
#
# The Python minor must match the build stage's: the venv copied from there
# keeps its packages under lib/python3.X/, and an interpreter of another minor
# looks elsewhere and finds nothing (ModuleNotFoundError for every import).
# Move both FROM lines together; Renovate never automerges a minor bump of
# this one (renovate.json).
FROM python:3.15.2-slim-trixie@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928

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
