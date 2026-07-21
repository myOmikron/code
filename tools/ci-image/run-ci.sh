#!/usr/bin/env bash
set -euo pipefail

# Always print sccache stats on exit so cache effectiveness is visible.
trap 'sccache --show-stats 2>/dev/null || true' EXIT

# When CI_BASE_REF is set, scope clippy/test to crates affected by the diff
# vs that ref. fmt and deny always run on the full workspace.
CRATE_ARGS=(--workspace)
SKIP_BUILD_STEPS=0
if [[ -n "${CI_BASE_REF:-}" ]]; then
    # Capture via command substitution (not `mapfile < <(...)`): a failure of
    # the script must abort CI (set -e) instead of silently yielding an empty
    # crate list, which would skip clippy/build/test entirely.
    _CRATES_OUT=$(./tools/changed-crates.py "$CI_BASE_REF")
    _CRATES=()
    if [[ -n "$_CRATES_OUT" ]]; then
        mapfile -t _CRATES <<< "$_CRATES_OUT"
    fi
    if [[ ${#_CRATES[@]} -eq 0 ]]; then
        SKIP_BUILD_STEPS=1
    else
        CRATE_ARGS=()
        for c in "${_CRATES[@]}"; do CRATE_ARGS+=(-p "$c"); done
    fi
fi

echo "::group::cargo fmt"
RUSTC_WRAPPER="" cargo +nightly fmt --all -- --check
echo "::endgroup::"

if (( SKIP_BUILD_STEPS )); then
    echo "No affected crates — skipping clippy, build, and test."
else
    echo "::group::cargo clippy"
    cargo clippy --locked "${CRATE_ARGS[@]}" --all-targets -- -D warnings
    echo "::endgroup::"

    echo "::group::cargo build (debug)"
    cargo build --locked "${CRATE_ARGS[@]}"
    echo "::endgroup::"

    echo "::group::cargo test"
    cargo test --locked "${CRATE_ARGS[@]}"
    echo "::endgroup::"
fi

echo "::group::cargo deny"
cargo deny --locked check
echo "::endgroup::"
