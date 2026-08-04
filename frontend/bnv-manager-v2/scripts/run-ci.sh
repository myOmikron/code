#!/usr/bin/env bash

set -e

# Check compiling
tsc && vite build --sourcemap true
# Check prettier
prettier --check src/
# Check eslint
eslint 'src/**/*.{ts,tsx}' --report-unused-disable-directives --max-warnings 0

# Check for missing translations
missing=$(grep -Er "\"(\w|-)+\.(\w|-)+\"" public/locales/ || true)
count=$(echo -n "$missing" | grep -c '^' || true)

if [ "$count" -gt 0 ]; then
  echo "$missing"
  echo "$count untranslated entries found"
  exit 1
fi
