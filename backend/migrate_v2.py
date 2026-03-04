"""
Migration script v2: Add new columns, tables, and migrate folder data.
Idempotent — safe to run multiple times.
Uses aiosqlite directly.
"""
import asyncio
import aiosqlite
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "app.db"


async def column_exists(db: aiosqlite.Connection, table: str, column: str) -> bool:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    rows = await cursor.fetchall()
    return any(row[1] == column for row in rows)


async def table_exists(db: aiosqlite.Connection, table: str) -> bool:
    cursor = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    )
    row = await cursor.fetchone()
    return row is not None


async def migrate():
    print(f"Opening database: {DB_PATH}")
    async with aiosqlite.connect(str(DB_PATH)) as db:
        # 0. Ensure all base model columns exist (may be missing from older DBs)
        base_columns = [
            ("papers", "paper_dir", "VARCHAR(1000)"),
            ("papers", "has_markdown", "BOOLEAN DEFAULT 0"),
            ("papers", "abstract", "TEXT"),
            ("papers", "authors", "VARCHAR(1000)"),
            ("papers", "tags", "VARCHAR(1000)"),
            ("notes", "file_name", "VARCHAR(500)"),
            ("notes", "note_type", "VARCHAR(50) DEFAULT 'note'"),
            ("notes", "selection_text", "TEXT"),
            ("notes", "position_data", "TEXT"),
        ]
        for table, col, col_type in base_columns:
            if not await column_exists(db, table, col):
                await db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
                print(f"  Added column {table}.{col}")
            else:
                print(f"  Column {table}.{col} already exists")

        # 1. ALTER TABLE papers ADD COLUMN venue
        if not await column_exists(db, "papers", "venue"):
            await db.execute("ALTER TABLE papers ADD COLUMN venue VARCHAR(500)")
            print("  Added column papers.venue")
        else:
            print("  Column papers.venue already exists")

        # 2. ALTER TABLE papers ADD COLUMN publish_date
        if not await column_exists(db, "papers", "publish_date"):
            await db.execute("ALTER TABLE papers ADD COLUMN publish_date VARCHAR(100)")
            print("  Added column papers.publish_date")
        else:
            print("  Column papers.publish_date already exists")

        # 3. ALTER TABLE papers ADD COLUMN brief_note
        if not await column_exists(db, "papers", "brief_note"):
            await db.execute("ALTER TABLE papers ADD COLUMN brief_note TEXT")
            print("  Added column papers.brief_note")
        else:
            print("  Column papers.brief_note already exists")

        # 4. CREATE TABLE paper_folders
        if not await table_exists(db, "paper_folders"):
            await db.execute("""
                CREATE TABLE paper_folders (
                    paper_id INTEGER NOT NULL,
                    folder_id INTEGER NOT NULL,
                    PRIMARY KEY (paper_id, folder_id),
                    FOREIGN KEY (paper_id) REFERENCES papers(id),
                    FOREIGN KEY (folder_id) REFERENCES folders(id)
                )
            """)
            print("  Created table paper_folders")
        else:
            print("  Table paper_folders already exists")

        # 5. Migrate existing papers.folder_id data to paper_folders
        cursor = await db.execute(
            "SELECT id, folder_id FROM papers WHERE folder_id IS NOT NULL"
        )
        rows = await cursor.fetchall()
        migrated = 0
        for paper_id, folder_id in rows:
            # Check if association already exists
            check = await db.execute(
                "SELECT 1 FROM paper_folders WHERE paper_id=? AND folder_id=?",
                (paper_id, folder_id),
            )
            if not await check.fetchone():
                await db.execute(
                    "INSERT INTO paper_folders (paper_id, folder_id) VALUES (?, ?)",
                    (paper_id, folder_id),
                )
                migrated += 1
        print(f"  Migrated {migrated} folder associations from papers.folder_id")

        # 6. CREATE TABLE app_settings
        if not await table_exists(db, "app_settings"):
            await db.execute("""
                CREATE TABLE app_settings (
                    key VARCHAR(200) NOT NULL PRIMARY KEY,
                    value TEXT DEFAULT '',
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            print("  Created table app_settings")
        else:
            print("  Table app_settings already exists")

        await db.commit()
        print("Migration v2 complete.")


if __name__ == "__main__":
    asyncio.run(migrate())
