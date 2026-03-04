#!/usr/bin/env python3
"""
Cleanup script to remove orphaned author files.

Orphaned files are author files that belong to papers that no longer exist in the database.
This can happen when papers are deleted but their filesystem directories are not cleaned up.

Usage:
    python cleanup_orphaned_authors.py
"""

import sqlite3
import shutil
from pathlib import Path
from database import PAPERS_DIR


def cleanup_orphaned_authors():
    """
    Clean up all orphaned author files.

    Logic:
    1. Get all valid paper IDs from the database
    2. Scan the filesystem for all paper directories
    3. Delete directories for papers that no longer exist in the database
    """

    # Connect to database and get valid paper IDs
    try:
        conn = sqlite3.connect("data/app.db")
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM paper")
        valid_paper_ids = {row[0] for row in cursor.fetchall()}
        conn.close()
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return

    print(f"Found {len(valid_paper_ids)} valid papers in database")

    # Scan filesystem
    papers_dir = PAPERS_DIR
    if not papers_dir.exists():
        print(f"Papers directory not found: {papers_dir}")
        return

    orphaned_count = 0
    orphaned_dirs = []

    for item in papers_dir.iterdir():
        if not item.is_dir():
            continue

        try:
            paper_id = int(item.name)
        except ValueError:
            # Skip non-numeric directories (like "Outline")
            continue

        if paper_id not in valid_paper_ids:
            orphaned_dirs.append((paper_id, item))

    if not orphaned_dirs:
        print("No orphaned directories found.")
        return

    print(f"\nFound {len(orphaned_dirs)} orphaned paper directories:")
    for paper_id, path in orphaned_dirs:
        size_mb = sum(f.stat().st_size for f in path.rglob("*") if f.is_file()) / (1024 * 1024)
        print(f"  - Paper ID {paper_id}: {path} ({size_mb:.2f} MB)")

    # Ask for confirmation
    response = input("\nDelete these orphaned directories? (yes/no): ").strip().lower()
    if response not in ("yes", "y"):
        print("Cleanup cancelled.")
        return

    # Delete orphaned directories
    for paper_id, path in orphaned_dirs:
        try:
            shutil.rmtree(path)
            print(f"  ✓ Deleted: {path}")
            orphaned_count += 1
        except Exception as e:
            print(f"  ✗ Failed to delete {path}: {e}")

    print(f"\nCleanup complete. Removed {orphaned_count} orphaned directories.")


if __name__ == "__main__":
    cleanup_orphaned_authors()
