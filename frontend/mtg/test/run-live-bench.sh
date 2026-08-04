#!/usr/bin/env bash
# Runs test/live-bench.html in headless Chromium and prints its JSON report. Measurement tool
# for the live-scan path (latency + accuracy on the labeled dataset) — not a CI gate.
set -euo pipefail

page="${1:-live-bench.html}"
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

vite --host 127.0.0.1 --port "${test_port}" --strictPort >"${test_tmp_dir}/vite.log" 2>&1 &
server_pid="$!"
for _ in {1..100}; do
  curl -fsS "http://127.0.0.1:${test_port}/" >/dev/null 2>&1 && break
  sleep 0.1
done

chromium --headless --no-sandbox --disable-gpu --remote-debugging-port="${debug_port}" \
  --user-data-dir="${test_tmp_dir}/chromium" about:blank >"${test_tmp_dir}/chromium.log" 2>&1 &
chromium_pid="$!"

node test/cdp-run.mjs "http://127.0.0.1:${debug_port}" "http://127.0.0.1:${test_port}" 900000 "${page}"
