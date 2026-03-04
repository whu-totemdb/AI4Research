"""
One-time migration script: moves papers from uploads/ to papers/{id}/ structure
and writes note .md files. Uses synchronous SQLite since it's a one-off script.

Usage: python migrate_to_folders.py
"""
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
PAPERS_DIR = DATA_DIR / "papers"
DB_PATH = DATA_DIR / "app.db"


def ensure_columns(conn: sqlite3.Connection):
    """Add new columns to existing tables if they don't exist yet."""
    cursor = conn.execute("PRAGMA table_info(papers)")
    paper_cols = {row[1] for row in cursor.fetchall()}

    if "paper_dir" not in paper_cols:
        conn.execute("ALTER TABLE papers ADD COLUMN paper_dir VARCHAR(1000)")
    if "has_markdown" not in paper_cols:
        conn.execute("ALTER TABLE papers ADD COLUMN has_markdown BOOLEAN DEFAULT 0")

    cursor = conn.execute("PRAGMA table_info(notes)")
    note_cols = {row[1] for row in cursor.fetchall()}

    if "file_name" not in note_cols:
        conn.execute("ALTER TABLE notes ADD COLUMN file_name VARCHAR(500)")
    if "note_type" not in note_cols:
        conn.execute("ALTER TABLE notes ADD COLUMN note_type VARCHAR(50) DEFAULT 'note'")

    conn.commit()


def migrate_papers(conn: sqlite3.Connection):
    """Copy PDFs from uploads/ to papers/{id}/paper.pdf and update DB."""
    cursor = conn.execute("SELECT id, file_path, title FROM papers")
    papers = cursor.fetchall()

    for paper_id, file_path, title in papers:
        if not file_path:
            continue

        paper_dir = PAPERS_DIR / str(paper_id)
        paper_dir.mkdir(parents=True, exist_ok=True)
        (paper_dir / "notes").mkdir(exist_ok=True)

        # Copy PDF from old location
        old_filename = file_path.split("/")[-1]
        old_path = UPLOAD_DIR / old_filename
        new_pdf = paper_dir / "paper.pdf"

        if old_path.exists() and not new_pdf.exists():
            shutil.copy2(str(old_path), str(new_pdf))
            print(f"  Copied paper {paper_id} ({title}): {old_path.name} -> papers/{paper_id}/paper.pdf")
        elif new_pdf.exists():
            print(f"  Paper {paper_id} ({title}): already migrated")
        else:
            print(f"  Paper {paper_id} ({title}): source file not found at {old_path}")
            continue

        conn.execute(
            "UPDATE papers SET paper_dir = ?, file_path = ? WHERE id = ?",
            (f"papers/{paper_id}", f"/papers/{paper_id}/paper.pdf", paper_id),
        )

    conn.commit()


def migrate_notes(conn: sqlite3.Connection):
    """Write .md files for existing notes."""
    cursor = conn.execute(
        "SELECT id, paper_id, content, page_number, selection_text, created_at, note_type FROM notes"
    )
    notes = cursor.fetchall()

    for note_id, paper_id, content, page_number, selection_text, created_at, note_type in notes:
        paper_dir = PAPERS_DIR / str(paper_id)
        notes_dir = paper_dir / "notes"
        notes_dir.mkdir(parents=True, exist_ok=True)

        note_type = note_type or "note"

        # Parse timestamp
        try:
            dt = datetime.fromisoformat(created_at)
            timestamp = dt.strftime("%Y%m%d_%H%M%S")
        except (ValueError, TypeError):
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        page_str = str(page_number) if page_number else "0"
        filename = f"note_{timestamp}_{page_str}.md"

        frontmatter = f"""---
note_id: {note_id}
note_type: {note_type}
page: {page_number or 'null'}
created: {timestamp}
---

"""
        if selection_text:
            frontmatter += f"> {selection_text}\n\n"

        note_path = notes_dir / filename
        note_path.write_text(frontmatter + (content or ""), encoding="utf-8")

        conn.execute(
            "UPDATE notes SET file_name = ?, note_type = ? WHERE id = ?",
            (filename, note_type, note_id),
        )
        print(f"  Note {note_id} (paper {paper_id}): wrote {filename}")

    conn.commit()


def main():
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    PAPERS_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(DB_PATH))
    try:
        print("Adding new columns if needed...")
        ensure_columns(conn)

        print("\nMigrating papers...")
        migrate_papers(conn)

        print("\nMigrating notes...")
        migrate_notes(conn)

        print("\nMigration complete.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
