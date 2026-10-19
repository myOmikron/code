#!/usr/bin/env python3
"""
Regenerate the API clients of one frontend, or of every frontend.

A frontend declares its clients in `frontend/<app>/api-clients.json`:

    [{ "backend": "mtg", "out": "src/api/generated" }]

For each entry the backend writes its spec to `<out>/openapi.json` on the host
(a Rust service through cargo, a Python service through uv, both with an
`openapi <output>` subcommand), then the OpenAPI generator (typescript-fetch,
version pinned in the root `openapitools.json`, options in
`generator-config.json` next to this script) and the app's prettier run in a
one-off container of the frontend dev image. A declared backend with no
directory under `services/` is skipped with a notice.

usage: tools/gen-api/gen-api.py [frontend]
"""

from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DECLARATION = "api-clients.json"
GENERATOR_CONFIG = Path(__file__).resolve().parent / "generator-config.json"
IMAGE = "code-frontend-dev:gen-api"
KEPT_FILES = {".openapi-generator-ignore"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("frontend", nargs="?", help="the frontend to generate for, all if left out")
    args = parser.parse_args()

    if args.frontend:
        declarations = [REPO_ROOT / "frontend" / args.frontend / DECLARATION]
        if not declarations[0].is_file():
            sys.exit(f"frontend/{args.frontend} has no {DECLARATION}")
    else:
        declarations = sorted(REPO_ROOT.glob(f"frontend/*/{DECLARATION}"))

    image_built = False
    for declaration in declarations:
        app = declaration.parent
        for entry in json.loads(declaration.read_text()):
            backend, out = entry["backend"], app / entry["out"]
            service = REPO_ROOT / "services" / backend
            if not service.is_dir():
                print(f"{app.name}: skipping {backend}, there is no services/{backend}")
                continue

            print(f"{app.name}: generating {entry['out']} from {backend}")
            if not image_built:
                build_image()
                image_built = True
            with tempfile.TemporaryDirectory() as scratch:
                spec = Path(scratch) / "openapi.json"
                write_spec(backend, service, spec)
                clean(out)
                shutil.move(spec, out / "openapi.json")
            generate(app, out)


def clean(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for child in out.iterdir():
        if child.name in KEPT_FILES:
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def write_spec(backend: str, service: Path, spec: Path) -> None:
    if (service / "Cargo.toml").is_file():
        run(["cargo", "run", "--quiet", "--package", backend, "--", "openapi", str(spec)])
    elif (service / "pyproject.toml").is_file():
        # The project's console script, e.g. `deck-lab`, carries the same
        # `openapi <output>` subcommand as a Rust service.
        project = tomllib.loads((service / "pyproject.toml").read_text())["project"]
        (cli,) = project["scripts"]
        run(
            ["uv", "run", "--directory", str(service), "--locked", "--all-extras"]
            + [cli, "openapi", str(spec)]
        )
    else:
        sys.exit(f"services/{backend} is neither a Rust nor a Python service, gen-api has no spec")


def build_image() -> None:
    context = io.BytesIO()
    with tarfile.open(fileobj=context, mode="w") as tar:
        tar.add(REPO_ROOT / "dev/common/frontend-dev.Dockerfile", arcname="Dockerfile")
        tar.add(REPO_ROOT / "package.json", arcname="package.json")
    subprocess.run(
        ["docker", "build", "--quiet", "--tag", IMAGE, "-"],
        input=context.getvalue(),
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
                "--volume",
                f"{REPO_ROOT}:/app",
                "--volume",
                f"{jar_cache}:/home/node/.cache/openapi-generator-cli",
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
    in_container("npx", "prettier", "--ignore-path", "/dev/null", "--write", f"{container_out}/openapi.json")


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=REPO_ROOT, check=True)


if __name__ == "__main__":
    main()
