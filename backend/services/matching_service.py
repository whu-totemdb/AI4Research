import re
from difflib import SequenceMatcher
from dataclasses import dataclass


@dataclass
class MatchResult:
    matched_section: str      # The matched MD paragraph (with LaTeX preserved)
    context_before: str       # Previous paragraph/section
    context_after: str        # Next paragraph/section
    confidence: float         # 0.0 - 1.0
    section_index: int        # Index of matched section in the chunks list


def split_markdown_chunks(md_content: str) -> list[str]:
    """Split markdown into chunks by headings and double newlines.
    Each chunk is a paragraph or section."""
    chunks = re.split(r'\n(?=#{1,6}\s)|\n\n+', md_content)
    return [c.strip() for c in chunks if c.strip()]


def strip_latex_for_matching(text: str) -> str:
    """Remove LaTeX markers for plain text comparison.
    Keeps the text content inside formulas where possible."""
    # Remove display math $$...$$
    text = re.sub(r'\$\$.*?\$\$', ' ', text, flags=re.DOTALL)
    # Remove inline math $...$
    text = re.sub(r'\$[^$]+\$', ' ', text)
    # Remove markdown formatting
    text = re.sub(r'[*_`#>\[\]()]', '', text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def match_text_to_markdown(selected_text: str, md_content: str) -> MatchResult | None:
    """Find the best matching markdown section for the selected PDF text.

    Algorithm:
    1. Split MD into chunks (paragraphs/sections)
    2. Strip LaTeX from chunks for comparison
    3. Use SequenceMatcher to find best match
    4. Return the original chunk (with LaTeX) plus context
    """
    if not selected_text or not md_content:
        return None

    chunks = split_markdown_chunks(md_content)
    if not chunks:
        return None

    selected_clean = strip_latex_for_matching(selected_text).lower()

    best_ratio = 0.0
    best_idx = 0

    for i, chunk in enumerate(chunks):
        chunk_clean = strip_latex_for_matching(chunk).lower()

        # Try substring match first (selected text might be part of a larger paragraph)
        if selected_clean in chunk_clean:
            ratio = 0.95  # High confidence for substring match
        elif chunk_clean in selected_clean:
            ratio = 0.90  # Selected text spans multiple chunks
        else:
            # Fuzzy match
            ratio = SequenceMatcher(None, selected_clean, chunk_clean).ratio()

        if ratio > best_ratio:
            best_ratio = ratio
            best_idx = i

    if best_ratio < 0.3:  # Too low confidence
        return None

    context_before = chunks[best_idx - 1] if best_idx > 0 else ""
    context_after = chunks[best_idx + 1] if best_idx < len(chunks) - 1 else ""

    return MatchResult(
        matched_section=chunks[best_idx],
        context_before=context_before,
        context_after=context_after,
        confidence=best_ratio,
        section_index=best_idx,
    )
