#!/usr/bin/env python3
"""
Print the frontends whose API clients gen-api has to check for the diff against BASE_REF.

A frontend is selected when
  - one of its declared backends is a workspace crate that `tools/changed-crates.py`
    reports as affected (the crate itself or one of its workspace dependencies changed),
  - a file of one of its declared non-Rust backends (`services/<backend>/`) changed,
  - its declaration or one of its generated client directories changed, or
  - something every generation runs through changed (SHARED), which selects all.

usage: tools/gen-api/changed-frontends.py [base]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DECLARATION = "api-clients.json"

SHARED = (
    "tools/gen-api/",
    "tools/changed-crates.py",
    "openapitools.json",
    "dev/common/frontend-dev.Dockerfile",
    ".github/workflows/gen-api.yaml",
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument(
        "base",
        nargs="?",
        default="origin/main",
        help="git ref to diff against (default: origin/main)",
    )
    args = parser.parse_args()

    declarations = sorted(REPO_ROOT.glob(f"frontend/*/{DECLARATION}"))
    changed = changed_files(args.base)

    if any(f.startswith(SHARED) for f in changed):
        for declaration in declarations:
            print(declaration.parent.name)
        return

    crates = set(
        subprocess.check_output(
            [sys.executable, "tools/changed-crates.py", args.base], cwd=REPO_ROOT, text=True
        ).split()
    )

    for declaration in declarations:
        app = declaration.parent.relative_to(REPO_ROOT).as_posix()
        watched = [f"{app}/{DECLARATION}"]
        selected = False
        for entry in json.loads(declaration.read_text()):
            backend = entry["backend"]
            watched.append(f"{app}/{entry['out']}/")
            if backend in crates:
                selected = True
            elif not (REPO_ROOT / "services" / backend / "Cargo.toml").is_file():
                watched.append(f"services/{backend}/")
        if selected or any(f == w or f.startswith(w) for f in changed for w in watched):
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
