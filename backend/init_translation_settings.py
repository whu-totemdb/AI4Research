"""Initialize translation settings in database"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from models import AppSetting
from database import DATABASE_URL

async def init_translation_settings():
    """Initialize translation settings with default values"""
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Check and create translation settings
        settings = [
            ("translation_enabled", "false"),
            ("translation_provider_id", ""),
            ("translation_prompt", "请将以下文本翻译成中文，保持专业术语的准确性："),
        ]

        for key, default_value in settings:
            existing = await session.get(AppSetting, key)
            if not existing:
                print(f"Creating setting: {key} = {default_value}")
                session.add(AppSetting(key=key, value=default_value))
            else:
                print(f"Setting already exists: {key} = {existing.value}")

        await session.commit()
        print("\nTranslation settings initialized successfully!")

if __name__ == "__main__":
    asyncio.run(init_translation_settings())
