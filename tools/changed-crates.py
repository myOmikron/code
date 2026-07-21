#!/usr/bin/env python3
"""
Print workspace crates that need to be rebuilt for the diff against BASE_REF.

For each changed file we walk up to the nearest workspace member's Cargo.toml,
then expand via cargo's dep graph to include every workspace crate that
(transitively) depends on a changed one.

Files outside the dep graph fall into three buckets:
  - global trigger  -> emit every workspace crate (full rebuild)
  - noop            -> ignored
  - unknown         -> emit every workspace crate, on the conservative side
"""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
from pathlib import Path

GLOBAL_FILES = {
    "Cargo.toml",
    "Cargo.lock",
    "deny.toml",
    "rust-toolchain.toml",
    ".rustfmt.toml",
}

# Anything under these prefixes triggers a full rebuild — they feed into many
# crates' build.rs (proto) or change the build environment itself (CI image).
GLOBAL_PREFIXES = (
    "proto/",
    "tools/ci-image/",
)

# Pure non-Rust paths whose changes can't affect the cargo build.
NOOP_GLOBS = (
    ".gitea/**",
    ".github/**",
    ".idea/**",
    ".dockerignore",
    ".gitignore",
    "charts/**",
    "dev/**",
    "docker/**",
    "frontend/**",
    "**/*.md"
)


def run(cmd: list[str], cwd: Path) -> str:
    return subprocess.check_output(cmd, cwd=cwd, text=True)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "base",
        nargs="?",
        default="origin/main",
        help="git ref to diff against (default: origin/main)",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="print classification of each changed file (and dep expansion) to stderr",
    )
    args = parser.parse_args()

    def log(msg: str) -> None:
        if args.verbose:
            print(msg, file=sys.stderr)

    repo = Path(run(["git", "rev-parse", "--show-toplevel"], cwd=Path.cwd()).strip())

    metadata = json.loads(
        run(["cargo", "metadata", "--format-version", "1"], cwd=repo)
    )
    workspace_ids: set[str] = set(metadata["workspace_members"])
    pkg_by_id: dict[str, dict] = {p["id"]: p for p in metadata["packages"]}
    workspace_names = sorted(pkg_by_id[i]["name"] for i in workspace_ids)

    # crate manifest dir (relative to repo root) -> crate name
    member_dir_to_name: dict[Path, str] = {}
    for pid in workspace_ids:
        manifest = Path(pkg_by_id[pid]["manifest_path"]).parent
        member_dir_to_name[manifest.relative_to(repo)] = pkg_by_id[pid]["name"]

    # Reverse-dep graph among workspace members only.
    rev_deps: dict[str, set[str]] = {pkg_by_id[i]["name"]: set() for i in workspace_ids}
    nodes_by_id = {n["id"]: n for n in metadata["resolve"]["nodes"]}
    for pid in workspace_ids:
        node = nodes_by_id[pid]
        consumer = pkg_by_id[pid]["name"]
        for dep in node["dependencies"]:
            if dep in workspace_ids:
                rev_deps[pkg_by_id[dep]["name"]].add(consumer)

    # Committed since base + uncommitted tracked changes + untracked files —
    # so the script also reflects WIP when run locally.
    committed = run(["git", "diff", "--name-only", f"{args.base}...HEAD"], cwd=repo)
    working = run(["git", "diff", "--name-only", "HEAD"], cwd=repo)
    untracked = run(
        ["git", "ls-files", "--others", "--exclude-standard"], cwd=repo
    )
    changed = sorted(
        {
            Path(line)
            for blob in (committed, working, untracked)
            for line in blob.splitlines()
            if line
        }
    )

    def emit_all() -> int:
        for n in workspace_names:
            print(n)
        return 0

    seeds: set[str] = set()
    for f in changed:
        s = str(f)
        if s in GLOBAL_FILES or any(s.startswith(p) for p in GLOBAL_PREFIXES):
            log(f"global  {s}")
            log("(global trigger -> emitting full workspace)")
            return emit_all()
        if any(pathlib.PurePath(f).full_match(glob, case_sensitive=False) for glob in NOOP_GLOBS):
            log(f"noop    {s}")
            continue
        for ancestor in [f, *f.parents]:
            if ancestor in member_dir_to_name:
                crate = member_dir_to_name[ancestor]
                log(f"crate   {s} -> {crate}")
                seeds.add(crate)
                break
        else:
            log(f"unknown {s}")
            print(
                f"changed-crates: unknown file '{s}', falling back to full rebuild",
                file=sys.stderr,
            )
            return emit_all()

    affected = set(seeds)
    queue = list(seeds)
    while queue:
        c = queue.pop()
        for d in rev_deps.get(c, ()):
            if d not in affected:
                log(f"dep     {d} depends on {c}")
                affected.add(d)
                queue.append(d)

    log(f"seeds:    {sorted(seeds)}")
    log(f"affected: {sorted(affected)}")

    for n in sorted(affected):
        print(n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
