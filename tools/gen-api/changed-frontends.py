#!/usr/bin/env python3
"""
Print the frontends whose API clients gen-api has to check for the diff against BASE_REF.

A frontend is selected when
  - one of its declared backends is a workspace crate that `tools/changed-crates.py`
    reports as affected (the crate itself or one of its workspace dependencies changed),
  - a file of one of its declared non-Rust backends (`services/<backend>/`) changed,
  - its declaration, its generated client directories, its `package.json` or its
    prettier config changed, or
  - something every generation runs through changed (SHARED), which selects all.

usage: tools/gen-api/changed-frontends.py [base]
"""

from __future__ import annotations

import argparse
import subprocess
import sys

from declarations import DECLARATION, REPO_ROOT, BackendKind, backend_kind, clients, declarations

SHARED = (
    "tools/gen-api/",
    "tools/changed-crates.py",
    "openapitools.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "dev/common/frontend-dev.Dockerfile",
    ".github/workflows/gen-api.yaml",
)

APP_FILES = (DECLARATION, "package.json", ".prettierrc")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument(
        "base",
        nargs="?",
        default="origin/main",
        help="git ref to diff against (default: origin/main)",
    )
    args = parser.parse_args()

    changed = changed_files(args.base)

    if any(f.startswith(SHARED) for f in changed):
        for declaration in declarations():
            print(declaration.parent.name)
        return

    crates = set(
        subprocess.check_output(
            [sys.executable, "tools/changed-crates.py", args.base], cwd=REPO_ROOT, text=True
        ).split()
    )

    for declaration in declarations():
        app = declaration.parent.relative_to(REPO_ROOT).as_posix()
        watched = [f"{app}/{name}" for name in APP_FILES]
        selected = False
        for client in clients(declaration):
            watched.append(f"{app}/{client.out}/")
            if backend_kind(client.backend) is BackendKind.RUST:
                selected |= client.backend in crates
            else:
                watched.append(f"services/{client.backend}/")
        if selected or any(f.startswith(w) for f in changed for w in watched):
            print(declaration.parent.name)


def changed_files(base: str) -> set[str]:
    """Committed since base plus uncommitted and untracked files, like changed-crates.py."""

    def git(*command: str) -> list[str]:
        return subprocess.check_output(["git", *command], cwd=REPO_ROOT, text=True).splitlines()

    return {
        *git("diff", "--name-only", f"{base}...HEAD"),
        *git("diff", "--name-only", "HEAD"),
        *git("ls-files", "--others", "--exclude-standard"),
    }


if __name__ == "__main__":
    main()
