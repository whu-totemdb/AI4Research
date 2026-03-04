import json
import re
from pathlib import Path
from database import PAPERS_DIR


def sanitize_filename(title: str, max_length: int = 50) -> str:
    """
    Convert paper title to safe filename.
    - Remove special characters
    - Replace spaces with underscores
    - Limit length to max_length characters
    """
    if not title:
        return "paper"

    # Remove or replace special characters
    # Keep only alphanumeric, Chinese characters, spaces, hyphens, underscores
    safe_title = re.sub(r'[^\w\s\-\u4e00-\u9fff]', '', title)
    # Replace multiple spaces/underscores with single underscore
    safe_title = re.sub(r'[\s_]+', '_', safe_title)
    # Remove leading/trailing underscores
    safe_title = safe_title.strip('_')

    # Limit length (be careful with multi-byte characters)
    if len(safe_title) > max_length:
        safe_title = safe_title[:max_length].rstrip('_')

    return safe_title if safe_title else "paper"


def get_md_filename(paper_id: int, title: str = None) -> str:
    """
    Get markdown filename for a paper.
    Priority:
    1. If paper.md exists (legacy), use it
    2. Otherwise, use {sanitized_title}.md

    Args:
        paper_id: Paper ID
        title: Paper title (optional, for new naming)

    Returns:
        Filename (without path), e.g., "paper.md" or "FedAPM_A_Novel_Approach.md"
    """
    paper_dir = PAPERS_DIR / str(paper_id)

    # Check if legacy paper.md exists
    legacy_path = paper_dir / "paper.md"
    if legacy_path.exists():
        return "paper.md"

    # Use new naming scheme
    if title:
        safe_name = sanitize_filename(title)
        return f"{safe_name}.md"

    # Fallback to paper.md if no title provided
    return "paper.md"


def create_paper_dir(paper_id: int) -> Path:
    """Create folder structure for a paper. Returns the directory path."""
    paper_dir = PAPERS_DIR / str(paper_id)
    paper_dir.mkdir(parents=True, exist_ok=True)
    return paper_dir


def save_pdf(paper_id: int, file_content: bytes) -> Path:
    """Save PDF to papers/{id}/paper.pdf"""
    paper_dir = create_paper_dir(paper_id)
    pdf_path = paper_dir / "paper.pdf"
    pdf_path.write_bytes(file_content)
    return pdf_path


def save_markdown(paper_id: int, content: str, title: str = None) -> Path:
    """
    Save/update markdown file for a paper.
    Uses new naming scheme: {sanitized_title}.md
    Falls back to paper.md if no title provided.

    Args:
        paper_id: Paper ID
        content: Markdown content
        title: Paper title (optional, for new naming)

    Returns:
        Path to saved markdown file
    """
    paper_dir = create_paper_dir(paper_id)
    filename = get_md_filename(paper_id, title)
    md_path = paper_dir / filename
    md_path.write_text(content, encoding="utf-8")
    return md_path


def get_markdown(paper_id: int, title: str = None) -> str | None:
    """
    Read markdown file for a paper.
    Checks both new naming scheme and legacy paper.md.

    Args:
        paper_id: Paper ID
        title: Paper title (optional, for new naming)

    Returns:
        Markdown content or None if not exists
    """
    paper_dir = PAPERS_DIR / str(paper_id)
    filename = get_md_filename(paper_id, title)
    md_path = paper_dir / filename

    if md_path.exists():
        return md_path.read_text(encoding="utf-8")
    return None


def append_note_to_jsonl(paper_id: int, note_data: dict) -> None:
    """Append a new note to notes.jsonl file."""
    paper_dir = create_paper_dir(paper_id)
    notes_dir = paper_dir / "notes"
    notes_dir.mkdir(parents=True, exist_ok=True)

    jsonl_path = notes_dir / "notes.jsonl"

    # Append the note as a JSON line
    with jsonl_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(note_data, ensure_ascii=False) + "\n")


def update_note_in_jsonl(paper_id: int, note_id: int, note_data: dict) -> None:
    """Update a specific note in notes.jsonl file."""
    paper_dir = PAPERS_DIR / str(paper_id)
    notes_dir = paper_dir / "notes"
    jsonl_path = notes_dir / "notes.jsonl"

    if not jsonl_path.exists():
        return

    # Read all notes
    notes = []
    with jsonl_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                notes.append(json.loads(line))

    # Update the specific note
    for i, note in enumerate(notes):
        if note.get("id") == note_id:
            notes[i] = note_data
            break

    # Write back atomically using temp file
    temp_path = jsonl_path.with_suffix(".jsonl.tmp")
    with temp_path.open("w", encoding="utf-8") as f:
        for note in notes:
            f.write(json.dumps(note, ensure_ascii=False) + "\n")

    # Atomic rename
    temp_path.replace(jsonl_path)


def delete_note_from_jsonl(paper_id: int, note_id: int) -> None:
    """Delete a specific note from notes.jsonl file."""
    paper_dir = PAPERS_DIR / str(paper_id)
    notes_dir = paper_dir / "notes"
    jsonl_path = notes_dir / "notes.jsonl"

    if not jsonl_path.exists():
        return

    # Read all notes except the one to delete
    notes = []
    with jsonl_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                note = json.loads(line)
                if note.get("id") != note_id:
                    notes.append(note)

    # Write back atomically using temp file
    temp_path = jsonl_path.with_suffix(".jsonl.tmp")
    with temp_path.open("w", encoding="utf-8") as f:
        for note in notes:
            f.write(json.dumps(note, ensure_ascii=False) + "\n")

    # Atomic rename
    temp_path.replace(jsonl_path)


def get_paper_dir(paper_id: int) -> Path:
    """Return absolute path to paper directory."""
    return PAPERS_DIR / str(paper_id)
