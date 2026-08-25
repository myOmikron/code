#!/bin/sh
# Load whatever the graph is missing, then hand off to the image's command.
#
# The advisor reads role coverage straight off FILLS_ROLE edges, so a graph
# nobody has ingested into does not fail — it reports 0 for every role against
# a normal-looking target corridor, which reads as a broken advisor rather than
# an empty database. Whoever hits that has no way to guess that the fix is four
# ingest commands, so the container runs them itself.
#
# `deck-lab bootstrap` asks the graph what it already holds and runs only the
# missing steps, so every start after the first costs four counting queries.
# Set BOOTSTRAP_ON_START=false to load the corpus by hand instead.
#
# GRAPH_RUNNER is how this image reaches the CLI: empty in the release image,
# where the venv is on PATH, and `uv run ...` in the dev image, where the venv
# is synced from the bind-mounted lockfile at start. Left unquoted on purpose —
# it is a command prefix, not a single argument.
set -e

if [ "${BOOTSTRAP_ON_START:-true}" != "false" ]; then
    # Fail-soft. A Scryfall outage must not turn into a container that never
    # serves: the advisor degrades to whatever the graph does hold, and the
    # reason is in the log line right above this one.
    ${GRAPH_RUNNER} deck-lab bootstrap ||
        echo "bootstrap: incomplete — the advisor will only report what the graph holds"
fi

exec "$@"
