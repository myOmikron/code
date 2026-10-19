"""The frontends' `api-clients.json` declarations, read by gen-api.py and changed-frontends.py."""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DECLARATION = "api-clients.json"


class BackendKind(Enum):
    """How a backend writes its spec: through cargo or through uv."""

    RUST = "rust"
    PYTHON = "python"


@dataclass(frozen=True)
class Client:
    """One entry of a frontend's declaration."""

    app: Path
    """The frontend's directory."""
    backend: str
    """The backend's directory name under `services/`."""
    out: str
    """The client's directory, relative to `app`."""

    @property
    def service(self) -> Path:
        return REPO_ROOT / "services" / self.backend

    @property
    def out_dir(self) -> Path:
        return self.app / self.out


def declarations() -> list[Path]:
    """Every frontend's declaration, sorted."""
    return sorted(REPO_ROOT.glob(f"frontend/*/{DECLARATION}"))


def clients(declaration: Path) -> list[Client]:
    """The entries of one declaration."""
    return [
        Client(app=declaration.parent, backend=entry["backend"], out=entry["out"])
        for entry in json.loads(declaration.read_text())
    ]


def backend_kind(backend: str) -> BackendKind | None:
    """The kind of `services/<backend>`, None if it is neither or does not exist."""
    service = REPO_ROOT / "services" / backend
    if (service / "Cargo.toml").is_file():
        return BackendKind.RUST
    if (service / "pyproject.toml").is_file():
        return BackendKind.PYTHON
    return None
