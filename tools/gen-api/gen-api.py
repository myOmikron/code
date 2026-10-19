#!/usr/bin/env python3
"""
Regenerate the API clients of one frontend, or of every frontend.

A frontend declares its clients in `frontend/<app>/api-clients.json`:

    [{ "backend": "mtg", "out": "src/api/generated" }]

For each entry the backend writes its spec on the host (a Rust service through
cargo, a Python service through uv, both with an `openapi <output>`
subcommand), then the OpenAPI generator (typescript-fetch, version pinned in the
root `openapitools.json`, options in `generator-config.json` next to this
script) and the app's prettier run in a one-off container of the frontend dev
image. All of it goes to a scratch directory first; only once it succeeded does
it replace `<out>`, the spec landing at `<out>/openapi.json`. A declared backend
with no directory under `services/` is skipped with a notice.

A Python service runs its single `[project.scripts]` entry, without the dev
group and with the extras listed under `[tool.gen-api] extras` in its
`pyproject.toml`.

usage: tools/gen-api/gen-api.py [frontend]
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

from declarations import (
    DECLARATION,
    REPO_ROOT,
    BackendKind,
    Client,
    backend_kind,
    clients,
    declarations,
)

GENERATOR_CONFIG = Path(__file__).resolve().parent / "generator-config.json"
IMAGE = "code-frontend-dev:gen-api"
KEPT_FILES = {".openapi-generator-ignore"}
CONTAINER_HOME = "/tmp"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("frontend", nargs="?", help="the frontend to generate for, all if left out")
    args = parser.parse_args()

    if args.frontend:
        selected = [REPO_ROOT / "frontend" / args.frontend / DECLARATION]
        if not selected[0].is_file():
            sys.exit(f"frontend/{args.frontend} has no {DECLARATION}")
    else:
        selected = declarations()

    work = []
    for declaration in selected:
        for client in clients(declaration):
            if not client.service.is_dir():
                print(
                    f"{client.app.name}: skipping {client.backend}, "
                    f"there is no services/{client.backend}"
                )
                continue
            kind = backend_kind(client.backend)
            if kind is None:
                sys.exit(
                    f"services/{client.backend} is neither a Rust nor a Python service, "
                    "gen-api has no spec"
                )
            work.append((client, kind))
    if not work:
        return

    tools = {"docker"} | {TOOLS[kind] for _, kind in work}
    missing = sorted(tool for tool in tools if shutil.which(tool) is None)
    if missing:
        sys.exit(f"gen-api needs {', '.join(missing)} on the PATH")

    build_image()
    for client, kind in work:
        print(f"{client.app.name}: generating {client.out} from {client.backend}")
        with tempfile.TemporaryDirectory(prefix=".gen-api-", dir=client.app) as scratch:
            generated = Path(scratch)
            write_spec(client, kind, generated / "openapi.json")
            for kept in KEPT_FILES:
                if (client.out_dir / kept).is_file():
                    shutil.copy2(client.out_dir / kept, generated / kept)
            generate(client.app, generated)
            replace(client.out_dir, generated)


TOOLS = {BackendKind.RUST: "cargo", BackendKind.PYTHON: "uv"}


def write_spec(client: Client, kind: BackendKind, spec: Path) -> None:
    match kind:
        case BackendKind.RUST:
            run(
                ["cargo", "run", "--quiet", "--package", client.backend, "--", "openapi", str(spec)]
            )
        case BackendKind.PYTHON:
            pyproject = tomllib.loads((client.service / "pyproject.toml").read_text())
            scripts = list(pyproject["project"].get("scripts", {}))
            if len(scripts) != 1:
                sys.exit(
                    f"services/{client.backend} has {len(scripts)} [project.scripts] entries, "
                    "gen-api needs exactly one to run `<script> openapi <output>`"
                )
            extras = pyproject.get("tool", {}).get("gen-api", {}).get("extras", [])
            run(
                ["uv", "run", "--directory", str(client.service), "--locked", "--no-dev"]
                + [arg for extra in extras for arg in ("--extra", extra)]
                + [scripts[0], "openapi", str(spec)]
            )


def replace(out: Path, generated: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for child in out.iterdir():
        if child.name in KEPT_FILES:
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    for child in generated.iterdir():
        if child.name not in KEPT_FILES or not (out / child.name).exists():
            shutil.move(child, out / child.name)


def build_image() -> None:
    with tempfile.TemporaryDirectory(prefix="gen-api-image-") as context:
        shutil.copy(REPO_ROOT / "dev/common/frontend-dev.Dockerfile", Path(context) / "Dockerfile")
        shutil.copy(REPO_ROOT / "package.json", Path(context) / "package.json")
        subprocess.run(
            ["docker", "build", "--quiet", "--tag", IMAGE, context],
            stdout=subprocess.DEVNULL,
            check=True,
        )


def generate(app: Path, out: Path) -> None:
    container_app = f"/app/{app.relative_to(REPO_ROOT)}"
    container_out = f"/app/{out.relative_to(REPO_ROOT)}"
    container_config = f"/app/{GENERATOR_CONFIG.relative_to(REPO_ROOT)}"
    jar_cache = Path.home() / ".cache/openapi-generator-cli"
    jar_cache.mkdir(parents=True, exist_ok=True)

    def in_container(*command: str) -> None:
        run(
            [
                "docker",
                "run",
                "--rm",
                "--user",
                f"{os.getuid()}:{os.getgid()}",
                "--env",
                "TZ=UTC",
                "--env",
                f"HOME={CONTAINER_HOME}",
                "--volume",
                f"{REPO_ROOT}:/app",
                "--volume",
                f"{jar_cache}:{CONTAINER_HOME}/.cache/openapi-generator-cli",
                "--workdir",
                container_app,
                IMAGE,
                *command,
            ]
        )

    in_container(
        "npx",
        "@openapitools/openapi-generator-cli",
        "--openapitools",
        "/app/openapitools.json",
        "generate",
        "--generator-name",
        "typescript-fetch",
        "--input-spec",
        f"{container_out}/openapi.json",
        "--output",
        container_out,
        "--config",
        container_config,
    )
    in_container(
        "npx", "prettier", "--ignore-path", "/dev/null", "--write", f"{container_out}/openapi.json"
    )


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=REPO_ROOT, check=True)


if __name__ == "__main__":
    main()
