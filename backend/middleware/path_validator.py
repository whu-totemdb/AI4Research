"""Path validation middleware for terminal sessions."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from database import PAPERS_DIR, DATA_DIR

logger = logging.getLogger(__name__)

# Allowed root directories for terminal sessions
ALLOWED_ROOTS = [PAPERS_DIR, DATA_DIR / "sessions"]


def validate_work_dir(path: Path) -> bool:
    """
    Check if path is within allowed root directories.

    Args:
        path: The directory path to validate

    Returns:
        True if path is within allowed roots, False otherwise
    """
    try:
        resolved_path = path.resolve()
        for allowed_root in ALLOWED_ROOTS:
            allowed_resolved = allowed_root.resolve()
            if resolved_path == allowed_resolved or allowed_resolved in resolved_path.parents:
                logger.info(f"Path validation SUCCESS: {resolved_path} is within {allowed_resolved}")
                return True

        logger.warning(f"Path validation FAILED: {resolved_path} is not within allowed roots")
        return False
    except Exception as exc:
        logger.error(f"Path validation ERROR for {path}: {exc}")
        return False


def get_safe_paper_dir(paper_id: int) -> Optional[Path]:
    """
    Get validated paper directory for a given paper ID.

    Args:
        paper_id: The paper ID

    Returns:
        Path object if valid and exists, None otherwise
    """
    paper_dir = PAPERS_DIR / str(paper_id)

    logger.info(f"Validating paper directory for paper_id={paper_id}: {paper_dir}")

    if not paper_dir.exists():
        logger.warning(f"Paper directory does not exist: {paper_dir}")
        return None

    if not validate_work_dir(paper_dir):
        logger.error(f"Paper directory failed validation: {paper_dir}")
        return None

    return paper_dir
