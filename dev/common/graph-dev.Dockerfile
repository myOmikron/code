FROM ghcr.io/astral-sh/uv:python3.14-trixie-slim

WORKDIR /app/services/mtg-graph

# The compose files run this container as 1000:1000 (matching the host uid) so
# nothing it writes into the bind-mounted workspace changes owner. The venv,
# uv's cache and the data dir therefore live outside the mount (backed by named
# volumes) and are created here so they start out writable by that uid.
ENV HOME=/tmp
ENV UV_PROJECT_ENVIRONMENT=/venv
ENV UV_CACHE_DIR=/uv-cache
ENV DATA_DIR=/data
# Keep .pyc files out of the bind-mounted src/
ENV PYTHONPYCACHEPREFIX=/tmp/pycache

RUN mkdir -p /venv /uv-cache /data && chown -R 1000:1000 /venv /uv-cache /data

EXPOSE 8000

# The corpus load, run before the API and skipped once the graph holds it — a
# fresh clone would otherwise serve an advisor that reports 0 for every role.
# BOOTSTRAP_ON_START=false turns it off. The script lives in the bind-mounted
# workspace, like everything else this image runs, and GRAPH_RUNNER tells it
# how to reach the CLI: `uv run` syncs the venv from the mounted lockfile, so
# the CLI is not on PATH before that has happened once.
ENV GRAPH_RUNNER="uv run --frozen --extra api --extra solver --extra edhrec"
ENTRYPOINT ["/app/services/mtg-graph/scripts/entrypoint.sh"]

# The workspace is bind-mounted at /app by the dev compose file. `uv run`
# syncs the venv from uv.lock on start; --frozen keeps it from rewriting the
# lockfile inside the mount. --root-path matches the public /api/graph
# prefix under which the mtg webserver proxies us.
CMD ["uv", "run", "--frozen", "--extra", "api", "--extra", "solver", "--extra", "edhrec", \
     "uvicorn", "deck_lab.api:app", "--host", "0.0.0.0", "--port", "8000", \
     "--reload", "--root-path", "/api/graph"]
