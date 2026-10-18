#!/usr/bin/env python3
"""Check the i18n conventions of the frontend apps (see CODING_STANDARDS.md, i18n).

Usage: check-i18n.py [APP_DIR ...]   (default: every frontend/*/ with public/locales)

- every translation key is exactly `category.slug`, with `category` one of CATEGORIES
- a source file binds at most two namespaces: one page namespace (`t`) and the general one (`tg`)
- no namespace is pulled in through the `ns` option
"""

import json
import re
import sys
from pathlib import Path

CATEGORIES = {"heading", "label", "button", "description", "error", "toast", "accessibility"}
SOURCE_SUFFIXES = {".ts", ".tsx"}
USE_TRANSLATION = re.compile(r"useTranslation\(\s*(\"[^\"]*\"|'[^']*')?\s*[,)]")
NS_OPTION = re.compile(r"\b(?:useTranslation|t\w*)\([^)]*\{[^}]*\bns\s*:")


def check_locales(app: Path) -> list[str]:
    errors = []
    for file in sorted((app / "public" / "locales").glob("*/*.json")):
        for category, slugs in json.loads(file.read_text()).items():
            if category not in CATEGORIES:
                errors.append(f"{file}: `{category}` is not a key category ({', '.join(sorted(CATEGORIES))})")
            if not isinstance(slugs, dict):
                errors.append(f"{file}: `{category}` is a single-level key, keys are `category.slug`")
                continue
            for slug, value in slugs.items():
                if not isinstance(value, str):
                    errors.append(f"{file}: `{category}.{slug}` nests deeper than `category.slug`")
    return errors


def check_sources(app: Path) -> list[str]:
    errors = []
    for file in sorted((app / "src").rglob("*")):
        if file.suffix not in SOURCE_SUFFIXES or "generated" in file.parts:
            continue
        source = file.read_text()
        if "react-i18next" not in source:
            continue
        namespaces = [match.group(1) for match in USE_TRANSLATION.finditer(source)]
        page = {ns for ns in namespaces if ns}
        if len(page) > 1 or len(set(namespaces)) > 2:
            listed = ", ".join(ns or "general" for ns in namespaces)
            errors.append(f"{file}: binds {len(namespaces)} namespaces ({listed}), at most one page namespace plus the general one")
        if NS_OPTION.search(source):
            errors.append(f"{file}: pulls in a namespace through the `ns` option")
    return errors


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    apps = [Path(arg) for arg in sys.argv[1:]] or sorted(
        path.parent.parent for path in root.glob("frontend/*/public/locales")
    )
    errors = [error for app in apps for error in check_locales(app) + check_sources(app)]
    for error in errors:
        print(error)
    if errors:
        print(f"{len(errors)} i18n convention violations")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
