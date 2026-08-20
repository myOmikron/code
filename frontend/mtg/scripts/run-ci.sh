#!/usr/bin/env bash

set -e

# Check compiling.
#
# Two statements, never `tsc && vite build`: `set -e` is ignored for every
# command of an AND-OR list except the last, so a chained `tsc` that fails
# neither aborts this script nor sets its exit status — it silently skips the
# build and the run still reports success.
tsc
vite build --sourcemap true
# Check prettier
prettier --check src/
# Check eslint
eslint 'src/**/*.{ts,tsx}' --report-unused-disable-directives --max-warnings 0
# Unit tests of the scan pipeline (matcher, index, gating)
vitest run

# Check for missing translations
missing=$(grep -Er "\"(\w|-)+\.(\w|-)+\"" public/locales/ || true)
count=$(echo -n "$missing" | grep -c '^' || true)

if [ "$count" -gt 0 ]; then
  echo "$missing"
  echo "$count untranslated entries found"
  exit 1
fi
