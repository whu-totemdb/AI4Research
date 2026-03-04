import asyncio
from database import async_session
from models import Paper
from sqlalchemy import select
from pathlib import Path

async def check_and_clean():
    async with async_session() as db:
        result = await db.execute(select(Paper))
        papers = result.scalars().all()

        print(f'Total papers in database: {len(papers)}')
        print('\nChecking file existence:\n')

        invalid_papers = []
        valid_papers = []

        for paper in papers:
            paper_dir = Path('data/papers') / str(paper.id)
            pdf_exists = (paper_dir / 'paper.pdf').exists()
            md_exists = (paper_dir / 'paper.md').exists()

            if not pdf_exists and not md_exists:
                invalid_papers.append(paper)
                print(f'[INVALID] Paper {paper.id}: {paper.title}')
            else:
                valid_papers.append(paper)
                status = []
                if pdf_exists: status.append('PDF')
                if md_exists: status.append('MD')
                print(f'[OK] Paper {paper.id}: {paper.title[:60]}... ({", ".join(status)})')

        print(f'\n\nSummary:')
        print(f'Valid papers: {len(valid_papers)}')
        print(f'Invalid papers (no files): {len(invalid_papers)}')

        if invalid_papers:
            print('\n\nInvalid papers to be deleted:')
            for p in invalid_papers:
                print(f'  - ID {p.id}: {p.title}')

            confirm = input('\nDelete these invalid papers from database? (yes/no): ')
            if confirm.lower() == 'yes':
                for p in invalid_papers:
                    await db.delete(p)
                await db.commit()
                print(f'\nDeleted {len(invalid_papers)} invalid papers.')
            else:
                print('\nCancelled.')
        else:
            print('\nAll papers are valid!')

if __name__ == '__main__':
    asyncio.run(check_and_clean())
