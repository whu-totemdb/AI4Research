"""
Migration script to add color column to notes table
"""
import asyncio
from sqlalchemy import text
from database import engine


async def migrate():
    async with engine.begin() as conn:
        # Check if color column exists
        result = await conn.execute(text(
            "SELECT COUNT(*) FROM pragma_table_info('notes') WHERE name='color'"
        ))
        exists = result.scalar()

        if exists == 0:
            print("Adding color column to notes table...")
            await conn.execute(text(
                "ALTER TABLE notes ADD COLUMN color VARCHAR(50)"
            ))
            print("[OK] Color column added successfully")
        else:
            print("[OK] Color column already exists")


if __name__ == "__main__":
    asyncio.run(migrate())
    print("Migration completed!")
