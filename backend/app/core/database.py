"""Database connection and session management"""
import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from app.core.config import settings

# Use SQLite for local dev if DATABASE_URL not set or postgres unavailable
database_url = settings.DATABASE_URL

if database_url.startswith("postgresql://"):
    # Try async postgres
    database_url = database_url.replace("postgresql://", "postgresql+asyncpg://")
else:
    # Fallback to SQLite for local dev
    database_url = "sqlite+aiosqlite:///./pricetag.db"

engine = create_async_engine(
    database_url,
    echo=settings.ENVIRONMENT == "development",
    pool_pre_ping=True if "postgresql" in database_url else False,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
