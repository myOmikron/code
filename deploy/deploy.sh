#!/usr/bin/env bash
# Rolls a released image onto the host a stack runs on.
#
#   deploy.sh <stack> <env-var> <version>
#   deploy.sh mtg MTG_VERSION v1.2.3
#
# Brings the checkout up to date, pins the new tag in the stack's .env and
# restarts what changed. Running it twice with the same version does nothing the
# second time — compose only recreates containers whose config actually moved.
#
# `.github/workflows/deploy.yaml` copies this script to the host and runs it
# there; the copy is what makes a change to it take effect on the same run that
# introduces it, rather than one deploy later.
set -euo pipefail

STACK=${1:?stack missing}
VAR=${2:?env var missing}
VERSION=${3:?version missing}

# Where the repo is cloned on the host
REPO=${DEPLOY_PATH:-/opt/code}
# How long the stack has to come up before the deploy counts as failed
TIMEOUT=${DEPLOY_TIMEOUT:-300}

cd "$REPO"

COMPOSE="deploy/${STACK}/compose.yml"
ENV_FILE="deploy/${STACK}/.env"

[ -f "$COMPOSE" ] || {
    echo "no ${COMPOSE} in ${REPO}" >&2
    exit 1
}

# Fast-forward only. A deploy is not the place to untangle a diverged checkout,
# and it must not throw away whatever someone was doing on the host.
git fetch --prune origin
git pull --ff-only

# The env file is the host's own state: untracked, holds the secrets and pins
# the versions. Everything else comes from the repo.
[ -f "$ENV_FILE" ] || {
    echo "no ${ENV_FILE} on this host — set it up once from env.example" >&2
    exit 1
}

if grep -q "^${VAR}=" "$ENV_FILE"; then
    sed -i "s|^${VAR}=.*|${VAR}=${VERSION}|" "$ENV_FILE"
else
    printf '%s=%s\n' "$VAR" "$VERSION" >>"$ENV_FILE"
fi
echo "pinned ${VAR}=${VERSION} in ${ENV_FILE}"

docker compose -f "$COMPOSE" pull
# `--wait` is what turns this into a deploy that can fail: without it compose
# returns as soon as the containers are created, and a service that dies on
# startup looks like a green deploy.
docker compose -f "$COMPOSE" up -d --remove-orphans --wait --wait-timeout "$TIMEOUT"
docker compose -f "$COMPOSE" ps
