"""Keep backend imports pointing one way: domain modules never import the modules built on top of them."""

import ast
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"

# Each backend module may only import the project modules listed for it.
ALLOWED = {
    "core": set(),
    "auth": {"core"},
    "campus": {"core", "monitoring"},
    "inventory": {"core", "auth", "campus"},
    "team": {"core", "auth"},
    "roster": {"core", "auth", "inventory"},
    "tickets": {"core", "auth", "inventory"},
    "monitoring": {"core", "auth"},
    "reporting": {"core", "auth", "roster", "tickets", "monitoring"},
    "seed": {"core", "auth", "campus", "monitoring"},
    "reset_demo": {"core", "seed"},
    "server": {"core", "seed", "auth", "inventory", "team", "roster", "tickets", "monitoring", "reporting"},
}


def project_imports(path):
    imported = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])
    return imported & set(ALLOWED)


def test_every_backend_module_is_listed():
    assert {p.stem for p in BACKEND.glob("*.py")} == set(ALLOWED)


def test_backend_imports_follow_the_allowed_direction():
    wrong = {
        name: sorted(project_imports(BACKEND / f"{name}.py") - allowed - {name})
        for name, allowed in ALLOWED.items()
        if project_imports(BACKEND / f"{name}.py") - allowed - {name}
    }
    assert not wrong, f"Imports outside the allowed direction: {wrong}"
