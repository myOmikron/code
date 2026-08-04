#!/usr/bin/env bash
# Scans the labeled photo dataset (test/dataset/) through the real app and reports recognition
# accuracy. Measurement tool for tuning — not a strict gate (see test/dataset-scan.mjs).
set -euo pipefail

test_tmp_dir="$(mktemp -d)"
test_port="4197"
debug_port="9242"
server_pid=""
chromium_pid=""

cleanup() {
  if [[ -n "${chromium_pid}" ]]; then kill "${chromium_pid}" 2>/dev/null || true; wait "${chromium_pid}" 2>/dev/null || true; fi
  if [[ -n "${server_pid}" ]]; then kill "${server_pid}" 2>/dev/null || true; wait "${server_pid}" 2>/dev/null || true; fi
  rm -rf "${test_tmp_dir}" 2>/dev/null || true
}
trap cleanup EXIT

vite --host 127.0.0.1 --port "${test_port}" --strictPort >"${test_tmp_dir}/vite.log" 2>&1 &
server_pid="$!"
for _ in {1..100}; do
  curl -fsS "http://127.0.0.1:${test_port}/" >/dev/null 2>&1 && break
  sleep 0.1
done

chromium --headless --no-sandbox --disable-gpu --remote-debugging-port="${debug_port}" \
  --user-data-dir="${test_tmp_dir}/chromium" about:blank >"${test_tmp_dir}/chromium.log" 2>&1 &
chromium_pid="$!"

node test/dataset-scan.mjs "http://127.0.0.1:${debug_port}" "http://127.0.0.1:${test_port}"
