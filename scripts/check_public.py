#!/usr/bin/env python3
"""Fail when a release snapshot contains private or retired deployment files."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ALLOWED_DATA_FILES = {
    "data/documents/.gitkeep",
    "data/logs/.gitkeep",
    "data/vector_db/.gitkeep",
}
FORBIDDEN_PREFIXES = (
    "deploy/",
    "frontend-react/android/",
)
FORBIDDEN_FILES = {
    ".env",
    "compose.yaml",
    "frontend-react/capacitor.config.ts",
    "frontend-react/public/manifest.webmanifest",
    "frontend-react/public/sw.js",
    "frontend-react/src/styles/mobile.css",
}
PRIVATE_PATTERNS = {
    "retired private server address": re.compile("154" + r"\.8\.193\.111"),
    "known private account identifier": re.compile("44914" + "0441|U202" + "311639"),
    "hard-coded private nickname": re.compile("祥" + "云"),
    "known private handle or path": re.compile(
        "Pilgrim" + r"Clownester|pil" + "grim@example|/home/pil" + "grim",
        re.IGNORECASE,
    ),
    "probable API key": re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
}


def repository_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return sorted(set(line for line in result.stdout.splitlines() if line))


def main() -> int:
    problems: list[str] = []
    files = repository_files()

    for relative in files:
        if relative in FORBIDDEN_FILES or relative.startswith(FORBIDDEN_PREFIXES):
            problems.append(f"retired desktop-external artifact: {relative}")
        if relative.startswith("data/") and relative not in ALLOWED_DATA_FILES:
            problems.append(f"runtime data must not be published: {relative}")

        path = ROOT / relative
        if not path.is_file() or path.stat().st_size > 2_000_000:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for label, pattern in PRIVATE_PATTERNS.items():
            if pattern.search(content):
                problems.append(f"{label}: {relative}")

    if problems:
        print("Public release check failed:")
        for problem in sorted(set(problems)):
            print(f"- {problem}")
        return 1

    print(f"Public release check passed ({len(files)} files inspected).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
