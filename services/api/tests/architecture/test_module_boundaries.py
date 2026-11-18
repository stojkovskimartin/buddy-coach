"""Enforce the module rules of ADR-0002 and CONTRIBUTING.md by reading imports."""

from __future__ import annotations

import ast
from collections.abc import Iterator
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[2] / "src" / "buddy_coach"
INFRASTRUCTURE = {"core", "health"}
# What a module may import from another module. Tables and repositories stay private.
PUBLIC_SUBMODULES = {"service", "schemas", "deps", "events", "domain"}
FRAMEWORK_PACKAGES = ("sqlalchemy", "fastapi", "starlette", "httpx", "asyncpg")


def _modules() -> list[str]:
    return sorted(p.name for p in SRC.iterdir() if p.is_dir() and (p / "__init__.py").exists())


def _imports(path: Path) -> Iterator[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            yield node.module


def _files(module: str) -> Iterator[Path]:
    yield from (SRC / module).rglob("*.py")


@pytest.mark.parametrize("module", _modules())
def test_modules_only_use_public_parts_of_other_modules(module: str) -> None:
    violations = []
    for path in _files(module):
        for name in _imports(path):
            parts = name.split(".")
            if len(parts) < 3 or parts[0] != "buddy_coach":
                continue
            other, submodule = parts[1], parts[2]
            if other in (module, *INFRASTRUCTURE):
                continue
            if submodule not in PUBLIC_SUBMODULES:
                violations.append(f"{path.relative_to(SRC)} imports {name}")
    assert violations == []


def test_core_does_not_depend_on_feature_modules() -> None:
    features = set(_modules()) - INFRASTRUCTURE
    violations = [
        f"{path.relative_to(SRC)} imports {name}"
        for path in _files("core")
        for name in _imports(path)
        if name.startswith("buddy_coach.") and name.split(".")[1] in features
    ]
    assert violations == []


def test_domain_files_are_framework_free() -> None:
    violations = [
        f"{path.relative_to(SRC)} imports {name}"
        for path in SRC.rglob("domain.py")
        for name in _imports(path)
        if name.startswith(FRAMEWORK_PACKAGES)
    ]
    assert violations == []
