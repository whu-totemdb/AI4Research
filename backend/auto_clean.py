import asyncio
from database import async_session
from models import Paper
from sqlalchemy import select
from pathlib import Path

async def auto_clean():
    async with async_session() as db:
        result = await db.execute(select(Paper))
        papers = result.scalars().all()

        print(f'Total papers in database: {len(papers)}\n')

        invalid_papers = []
        for paper in papers:
            paper_dir = Path('data/papers') / str(paper.id)
            pdf_exists = (paper_dir / 'paper.pdf').exists()
            md_exists = (paper_dir / 'paper.md').exists()

            if not pdf_exists and not md_exists:
                invalid_papers.append(paper)
                print(f'[INVALID] Paper {paper.id}: {paper.title}')

        if invalid_papers:
            print(f'\nDeleting {len(invalid_papers)} invalid papers...')
            for p in invalid_papers:
                await db.delete(p)
            await db.commit()
            print('Done!')
        else:
            print('All papers are valid!')

if __name__ == '__main__':
    asyncio.run(auto_clean())
