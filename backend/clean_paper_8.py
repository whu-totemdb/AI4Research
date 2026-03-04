import asyncio
from database import async_session
from models import Paper, AuthorInfo, Note
from sqlalchemy import select, delete
from pathlib import Path

async def clean_paper_8():
    async with async_session() as db:
        paper_id = 8

        # Delete author infos
        result = await db.execute(select(AuthorInfo).where(AuthorInfo.paper_id == paper_id))
        author_infos = result.scalars().all()
        print(f'Found {len(author_infos)} author_infos for paper {paper_id}')
        for ai in author_infos:
            await db.delete(ai)

        # Delete notes
        result = await db.execute(select(Note).where(Note.paper_id == paper_id))
        notes = result.scalars().all()
        print(f'Found {len(notes)} notes for paper {paper_id}')
        for note in notes:
            await db.delete(note)

        # Delete paper
        paper = await db.get(Paper, paper_id)
        if paper:
            print(f'Deleting paper: {paper.title}')
            await db.delete(paper)

        await db.commit()
        print('Done!')

if __name__ == '__main__':
    asyncio.run(clean_paper_8())
