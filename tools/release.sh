#!/usr/bin/env bash
# Cuts a Release: files a frontend's pending Release notes under the version,
# commits them and creates the signed tag `<service>/v<version>`. Never pushes.
#
# Usage: tools/release.sh <service> <version>, e.g. tools/release.sh mtg 0.57.0

set -euo pipefail

service="${1:?usage: release.sh <service> <version>}"
version="${2:?usage: release.sh <service> <version>}"
version="${version#v}"
tag="$service/v$version"

fail() {
    echo "release: $*" >&2
    exit 1
}

cd "$(git rev-parse --show-toplevel)"

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "$version is not a major.minor.patch version"
[[ -f "docker/$service.yaml" ]] || fail "docker/$service.yaml does not exist, $service has no release manifest"
[[ -z "$(git status --porcelain)" ]] || fail "the working tree is dirty"
[[ "$(git branch --show-current)" == "main" ]] || fail "not on main"
git fetch --quiet origin main
[[ "$(git rev-list --count HEAD..origin/main)" == "0" ]] || fail "main is behind origin/main"
if git rev-parse --quiet --verify "refs/tags/$tag" > /dev/null; then
    fail "$tag already exists"
fi

notes="frontend/$service/release-notes"
if [[ -d "$notes" ]]; then
    pnpm --dir "frontend/$service" run --silent release-notes:check
    [[ ! -e "$notes/$version" ]] || fail "$notes/$version already exists"

    shopt -s nullglob
    pending=("$notes"/unreleased/*.yaml)
    if ((${#pending[@]} > 0)); then
        mkdir "$notes/$version"
        git mv "${pending[@]}" "$notes/$version/"
        printf 'version: %s\ndate: %s\n' "$version" "$(date +%F)" > "$notes/$version/release.yaml"
        git add "$notes/$version/release.yaml"
        git commit --quiet -m "$service: release notes for v$version"
        echo "Filed ${#pending[@]} Release notes under $notes/$version"
    else
        echo "No pending Release notes"
    fi
fi

git tag -s "$tag" -m "$service v$version"
echo "Tagged $tag. Push with: git push origin main $tag"
