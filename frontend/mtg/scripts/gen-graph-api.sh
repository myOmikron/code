#!/usr/bin/env bash
# Regenerates the graph advisor's API client (src/api/graph-generated) from the
# FastAPI service's OpenAPI spec. Mirror of gen-api.sh for the second backend.

set -e

PROJECT_ROOT=$(dirname "$(dirname "$0")")
REPO_ROOT="${PROJECT_ROOT}/../.."
SPEC="${PROJECT_ROOT}/graph-openapi.json"
GENERATED="${PROJECT_ROOT}/src/api/graph-generated"
CONFIG="${GENERATED}/config.json"
TMP="${PROJECT_ROOT}/tmp"

GRAPH_URL="${GRAPH_URL:-http://graph:8000}"
wget --no-check-certificate "${GRAPH_URL}/openapi.json" -O "$SPEC"

mkdir -p "${TMP}"
mkdir -p "${GENERATED}/.openapi-generator"
touch "${GENERATED}/config.json" "${GENERATED}/.openapi-generator-ignore" "${GENERATED}/README.md"
mv "${GENERATED}/config.json" "${GENERATED}/.openapi-generator-ignore" "${GENERATED}/.openapi-generator" "${GENERATED}/README.md" "${TMP}"
rm -rf "$GENERATED"
mkdir -p "$GENERATED"
mv "${TMP}/config.json" "${TMP}/.openapi-generator-ignore" "${TMP}/.openapi-generator" "${TMP}/README.md" "${GENERATED}"

npx @openapitools/openapi-generator-cli --openapitools "${REPO_ROOT}/openapitools.json" generate -g typescript-fetch -i "${SPEC}" -o "${GENERATED}" -c "${CONFIG}"

# Run from the project dir so npx picks the app's own prettier (+ plugins)
(cd "${PROJECT_ROOT}" && npx prettier --write graph-openapi.json)

echo Done
