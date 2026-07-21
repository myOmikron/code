#!/usr/bin/env bash

set -e

PROJECT_ROOT=$(dirname "$(dirname "$0")")
REPO_ROOT="${PROJECT_ROOT}/../.."
SPEC="${PROJECT_ROOT}/openapi.json"
GENERATED="${PROJECT_ROOT}/src/api/generated"
CONFIG="${GENERATED}/config.json"
TMP="${PROJECT_ROOT}/tmp"

WEBSERVER_URL="${WEBSERVER_URL:-http://webserver-dev:8080}"
wget --no-check-certificate "${WEBSERVER_URL}/docs/frontend.json" -O "$SPEC"

mkdir -p "${TMP}"
mkdir -p "${GENERATED}/.openapi-generator"
touch "${GENERATED}/config.json" "${GENERATED}/.openapi-generator-ignore" "${GENERATED}/README.md"
mv "${GENERATED}/config.json" "${GENERATED}/.openapi-generator-ignore" "${GENERATED}/.openapi-generator" "${GENERATED}/README.md" "${TMP}"
rm -rf "$GENERATED"
mkdir -p "$GENERATED"
mv "${TMP}/config.json" "${TMP}/.openapi-generator-ignore" "${TMP}/.openapi-generator" "${TMP}/README.md" "${GENERATED}"

npx @openapitools/openapi-generator-cli --openapitools "${REPO_ROOT}/openapitools.json" generate -g typescript-fetch -i "${SPEC}" -o "${GENERATED}" -c "${CONFIG}"

# Run from the project dir so npx picks the app's own prettier (+ plugins)
(cd "${PROJECT_ROOT}" && npx prettier --write openapi.json)

echo Done
