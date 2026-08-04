#!/usr/bin/env bash

set -e

OPENAPI_DEFINITIONS=("admin.json" "club-admin.json" "club-member.json" "common.json" "auth.json")

PROJECT_ROOT=$(dirname "$(dirname \""$0"\")")

function generate() {
  local JSON="$1"
  NAME="$(echo "$JSON" | cut -d "." -f 1)"

  SPEC="${PROJECT_ROOT}/${JSON}"
  GENERATED="${PROJECT_ROOT}/src/api/generated/${NAME}"
  CONFIG="${GENERATED}/config.json"
  TMP="${PROJECT_ROOT}/tmp"

  wget --no-check-certificate "http://nginx-dev/api/v1/frontend/$JSON" -O "$SPEC"

  if [ ! -s "$SPEC" ]; then
    echo "{}" > "$SPEC"
  fi

  mkdir -p "${TMP}"
  rm -rf "${TMP:?}/*"
  mkdir -p "${GENERATED}/.openapi-generator"
  touch "${GENERATED}/config.json" "${GENERATED}/.openapi-generator-ignore" "${GENERATED}/README.md"
  mv "${GENERATED}/config.json" "${GENERATED}/.openapi-generator-ignore" "${GENERATED}/.openapi-generator" "${GENERATED}/README.md" "${TMP}"
  rm -rf "$GENERATED"
  mkdir -p "$GENERATED"
  mv "${TMP}/config.json" "${TMP}/.openapi-generator-ignore" "${TMP}/.openapi-generator" "${TMP}/README.md" "${GENERATED}"

  cp "${PROJECT_ROOT}/scripts/config.json" "${CONFIG}"

  npx @openapitools/openapi-generator-cli generate -g typescript-fetch -i "${SPEC}" -o "${GENERATED}" -c "${CONFIG}"

  npx prettier --write "${SPEC}"
}

for i in "${OPENAPI_DEFINITIONS[@]}"
do
generate "$i"
done
