import asyncio
from database import async_session
from models import Paper, AuthorInfo, Note, PaperReference
from sqlalchemy import select
import shutil
from pathlib import Path

async def clear_all_papers():
    async with async_session() as db:
        # Get all papers
        result = await db.execute(select(Paper))
        papers = result.scalars().all()

        print(f'Found {len(papers)} papers to delete\n')

        for paper in papers:
            print(f'Deleting paper {paper.id}: {paper.title}')

            # Delete author infos
            result = await db.execute(select(AuthorInfo).where(AuthorInfo.paper_id == paper.id))
            for ai in result.scalars().all():
                await db.delete(ai)

            # Delete notes
            result = await db.execute(select(Note).where(Note.paper_id == paper.id))
            for note in result.scalars().all():
                await db.delete(note)

            # Delete references
            result = await db.execute(select(PaperReference).where(
                (PaperReference.source_paper_id == paper.id) |
                (PaperReference.target_paper_id == paper.id)
            ))
            for ref in result.scalars().all():
                await db.delete(ref)

            # Delete paper
            await db.delete(paper)

            # Delete paper directory
            paper_dir = Path('data/papers') / str(paper.id)
            if paper_dir.exists():
                shutil.rmtree(paper_dir, ignore_errors=True)
                print(f'  - Deleted directory: {paper_dir}')

        await db.commit()
        print(f'\nAll {len(papers)} papers deleted successfully!')

if __name__ == '__main__':
    asyncio.run(clear_all_papers())
