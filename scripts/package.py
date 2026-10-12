#!/usr/bin/env python3
"""Package extension-only and GitHub-ready source archives using the stdlib."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / "dist"
output.mkdir(exist_ok=True)
with ZipFile(output / "linkedin-floating-toolbar-extension.zip", "w", ZIP_DEFLATED) as archive:
    for file in sorted((root / "extension").rglob("*")):
        if file.is_file():
            archive.write(file, Path("linkedin-floating-toolbar-extension") / file.relative_to(root / "extension"))
with ZipFile(output / "linkedin-floating-toolbar-github.zip", "w", ZIP_DEFLATED) as archive:
    for file in sorted(root.rglob("*")):
        relative = file.relative_to(root)
        if file.is_file() and not any(part in {".git", "node_modules", "dist", "test-results"} for part in relative.parts):
            archive.write(file, Path("linkedin-floating-toolbar") / relative)
print("Created extension and source archives in dist/")
