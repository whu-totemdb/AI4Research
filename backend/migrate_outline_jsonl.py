"""
Migration script to create initial papers_outline.jsonl file.

Run this once to generate the JSONL file from existing database data:
    python migrate_outline_jsonl.py
"""
import asyncio
from database import async_session
from services.outline_service import rebuild_full_outline


async def main():
    print("Creating papers_outline.jsonl from database...")
    async with async_session() as db:
        await rebuild_full_outline(db)
    print("Outline JSONL created successfully at backend/data/papers/Outline/papers_outline.jsonl")


if __name__ == "__main__":
    asyncio.run(main())
