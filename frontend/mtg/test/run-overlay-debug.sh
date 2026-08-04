#!/usr/bin/env bash
# Renders the scan overlay for every dataset photo and saves viewfinder screenshots to
# test/debug-overlays/ for visual inspection of the card-detection geometry.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out_dir="${1:-${here}/debug-overlays}"
test_tmp_dir="$(mktemp -d)"
test_port="4198"
debug_port="9243"
server_pid=""
chromium_pid=""

cleanup() {
  if [[ -n "${chromium_pid}" ]]; then kill "${chromium_pid}" 2>/dev/null || true; wait "${chromium_pid}" 2>/dev/null || true; fi
  if [[ -n "${server_pid}" ]]; then kill "${server_pid}" 2>/dev/null || true; wait "${server_pid}" 2>/dev/null || true; fi
  rm -rf "${test_tmp_dir}" 2>/dev/null || true
}
trap cleanup EXIT

# Use the card-lens-local vite explicitly: bare `vite` on PATH may resolve to another project's
# vite (e.g. semelei's in the monorepo), which serves the wrong root and the index never loads.
"${here}/../node_modules/.bin/vite" --host 127.0.0.1 --port "${test_port}" --strictPort >"${test_tmp_dir}/vite.log" 2>&1 &
server_pid="$!"
for _ in {1..100}; do
  curl -fsS "http://127.0.0.1:${test_port}/" >/dev/null 2>&1 && break
  sleep 0.1
done

chromium --headless --no-sandbox --disable-gpu --window-size=1400,1000 \
  --remote-debugging-port="${debug_port}" \
  --user-data-dir="${test_tmp_dir}/chromium" about:blank >"${test_tmp_dir}/chromium.log" 2>&1 &
chromium_pid="$!"

node test/overlay-debug.mjs "http://127.0.0.1:${debug_port}" "http://127.0.0.1:${test_port}" "${out_dir}"
