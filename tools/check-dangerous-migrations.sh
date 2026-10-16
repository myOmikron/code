#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-origin/main}"

git diff --name-only --diff-filter=d "${BASE}...HEAD" -- '**/migrations/*.toml' | while read -r file; do
    grep -nE "RawSQL|RenameField|DeleteField|DeleteModel|SetFieldType|DeleteIndex" "$file" | while IFS=: read -r line _; do
        echo "::warning file=${file},line=${line},title=Dangerous migration::Pay special attention to this operation during review"
    done || true
done
