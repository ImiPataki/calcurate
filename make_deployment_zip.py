#!/usr/bin/env python3
"""Create a deployment-ready zip archive for CalcuRate.

The archive contains source code, lockfiles, Docker/deployment files, and docs.
It intentionally excludes local build/runtime artifacts such as virtualenvs,
node_modules, logs, SQLite databases, git metadata, caches, and previous zips.
"""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


REQUIRED_PATHS = [
    "backend",
    "frontend",
    "docs",
    ".dockerignore",
    "Dockerfile",
    "README.md",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "deploy_calcurate.sh",
    "make_deployment_zip.py",
]

OPTIONAL_WORKBOOK = "England7_wo.xlsm"

EXCLUDED_DIR_NAMES = {
    ".git",
    ".idea",
    ".mypy_cache",
    ".pnpm-store",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "dist",
    "logs",
    "node_modules",
}

EXCLUDED_FILE_SUFFIXES = {
    ".db",
    ".pyc",
    ".pyo",
    ".sqlite",
    ".sqlite3",
    ".tar",
    ".zip",
}

EXCLUDED_FILE_NAMES = {
    ".env",
    ".env.local",
    ".env.production",
}


def repo_root() -> Path:
    return Path(__file__).resolve().parent


def default_output(root: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return root / f"calcurate_deployment_{timestamp}.zip"


def should_exclude(path: Path, root: Path) -> bool:
    relative = path.relative_to(root)
    if any(part in EXCLUDED_DIR_NAMES for part in relative.parts[:-1]):
        return True
    if path.is_dir() and path.name in EXCLUDED_DIR_NAMES:
        return True
    if path.name in EXCLUDED_FILE_NAMES:
        return True
    if path.suffix.lower() in EXCLUDED_FILE_SUFFIXES:
        return True
    return False


def iter_files(root: Path, include_workbook: bool) -> list[Path]:
    paths = list(REQUIRED_PATHS)
    if include_workbook:
        paths.append(OPTIONAL_WORKBOOK)

    files: list[Path] = []
    missing: list[str] = []

    for entry in paths:
        path = root / entry
        if not path.exists():
            missing.append(entry)
            continue
        if should_exclude(path, root):
            continue
        if path.is_file():
            files.append(path)
            continue
        for child in path.rglob("*"):
            if should_exclude(child, root):
                continue
            if child.is_file():
                files.append(child)

    if missing:
        joined = ", ".join(missing)
        raise FileNotFoundError(f"Required deployment paths are missing: {joined}")

    return sorted(set(files), key=lambda item: item.relative_to(root).as_posix())


def create_zip(output: Path, files: list[Path], root: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for file_path in files:
            archive.write(file_path, file_path.relative_to(root).as_posix())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a deployment zip for CalcuRate.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output zip path. Defaults to calcurate_deployment_<timestamp>.zip in the repo root.",
    )
    parser.add_argument(
        "--include-workbook",
        action="store_true",
        help="Include England7_wo.xlsm. Not needed for Docker deployment because rates are seeded in backend/app/seed.py.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List files that would be included without writing a zip.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = repo_root()
    output = (args.output or default_output(root)).resolve()
    files = iter_files(root, args.include_workbook)

    print(f"Repository: {root}")
    print(f"Files selected: {len(files)}")

    if args.dry_run:
        for file_path in files:
            print(file_path.relative_to(root).as_posix())
        return 0

    create_zip(output, files, root)
    size_mb = output.stat().st_size / (1024 * 1024)
    print(f"Created: {output}")
    print(f"Size: {size_mb:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
