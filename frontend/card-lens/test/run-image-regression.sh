#!/usr/bin/env bash
set -euo pipefail

test_tmp_dir="$(mktemp -d)"
test_port="4197"
server_pid=""

cleanup() {
  if [[ -n "${server_pid}" ]]; then
    kill "${server_pid}" 2>/dev/null || true
  fi
  rm -rf "${test_tmp_dir}"
}
trap cleanup EXIT

vite --host 127.0.0.1 --port "${test_port}" --strictPort >"${test_tmp_dir}/vite.log" 2>&1 &
server_pid="$!"

for _ in {1..50}; do
  if curl -fsS "http://127.0.0.1:${test_port}/test/sauron-regression.html" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

failed="false"
test_pages=(sauron-regression.html tyvar-regression.html grisly-salvage-regression.html)
if [[ "$#" -gt 0 ]]; then
  test_pages=("$@")
fi
for test_page in "${test_pages[@]}"; do
  chromium \
    --headless \
    --no-sandbox \
    --disable-gpu \
    --user-data-dir="${test_tmp_dir}/chromium-${test_page}" \
    --virtual-time-budget=30000 \
    --dump-dom \
    "http://127.0.0.1:${test_port}/test/${test_page}" \
    >"${test_tmp_dir}/${test_page}" \
    2>"${test_tmp_dir}/chromium-${test_page}.log"

  sed -n '/<pre id="result">/,/<\/pre>/p' "${test_tmp_dir}/${test_page}"
  if ! grep -q 'data-status="passed"' "${test_tmp_dir}/${test_page}"; then
    failed="true"
  fi
done

if [[ "${failed}" == "true" ]]; then
  exit 1
fi
