#!/usr/bin/env bash
set -euo pipefail

test_tmp_dir="$(mktemp -d)"
test_port="4197"
debug_port="9242"
server_pid=""
chromium_pid=""

cleanup() {
  if [[ -n "${chromium_pid}" ]]; then
    kill "${chromium_pid}" 2>/dev/null || true
    wait "${chromium_pid}" 2>/dev/null || true
  fi
  if [[ -n "${server_pid}" ]]; then
    kill "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
  fi
  # Chromium can still be flushing its profile dir; tolerate the race.
  rm -rf "${test_tmp_dir}" 2>/dev/null || true
}
trap cleanup EXIT

vite --host 127.0.0.1 --port "${test_port}" --strictPort >"${test_tmp_dir}/vite.log" 2>&1 &
server_pid="$!"

for _ in {1..100}; do
  if curl -fsS "http://127.0.0.1:${test_port}/test/sauron-regression.html" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

test_pages=(sauron-regression.html tyvar-regression.html grisly-salvage-regression.html inspired-charge-regression.html hushwing-gryff-regression.html)
if [[ "$#" -gt 0 ]]; then
  test_pages=("$@")
fi

# A single Chromium with the DevTools protocol; cdp-run.mjs navigates each page and polls its
# data-status in real time. Real-time polling (not --virtual-time-budget) is required because
# the OCR fallback does real-time work in Tesseract's WASM worker.
chromium \
  --headless \
  --no-sandbox \
  --disable-gpu \
  --remote-debugging-port="${debug_port}" \
  --user-data-dir="${test_tmp_dir}/chromium" \
  about:blank \
  >"${test_tmp_dir}/chromium.log" 2>&1 &
chromium_pid="$!"

node test/cdp-run.mjs \
  "http://127.0.0.1:${debug_port}" \
  "http://127.0.0.1:${test_port}" \
  120000 \
  "${test_pages[@]}"
