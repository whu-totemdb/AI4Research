from __future__ import annotations

import hashlib
import re
from pathlib import Path

_INVALID_FILENAME_CHARS = re.compile(r'[\\/:*?"<>|]')
_WHITESPACE = re.compile(r"\s+")
_MAX_BASENAME_LEN = 120


def author_filename(author_name: str) -> str:
    """Return a safe file name for an author markdown file."""
    name = (author_name or "").strip()
    if not name:
        name = "unknown_author"

    safe = _INVALID_FILENAME_CHARS.sub("_", name)
    safe = _WHITESPACE.sub(" ", safe).strip().rstrip(". ")
    if not safe:
        safe = "unknown_author"
    return safe[:_MAX_BASENAME_LEN] + ".md"


def author_filename_with_hash(author_name: str) -> str:
    """Return a collision-resistant safe file name for an author markdown file."""
    base = author_filename(author_name)
    stem = Path(base).stem
    suffix = hashlib.sha1((author_name or "").encode("utf-8")).hexdigest()[:8]
    return f"{stem}-{suffix}.md"


def resolve_author_file_path(authors_dir: Path, author_name: str) -> Path:
    """
    Resolve an existing author file path from sanitized/legacy naming schemes.
    Falls back to the default sanitized path if no file exists yet.
    """
    candidates = [
        authors_dir / author_filename(author_name),
        authors_dir / author_filename_with_hash(author_name),
        authors_dir / f"{author_name}.md",
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]

