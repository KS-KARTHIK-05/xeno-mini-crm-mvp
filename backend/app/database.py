from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings
settings = get_settings()
db_url = settings.database_url

# Ensure we use asyncpg driver for async SQL operations
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)

# Use the IPv4-compatible pooled port (6543) instead of direct port (5432) 
# for Supabase connections to bypass IPv6 routing limitations on platforms like Railway.
if "supabase.co:5432" in db_url:
    db_url = db_url.replace("supabase.co:5432", "supabase.co:6543")

engine = create_async_engine(
    db_url,
    echo=False,        # set True for SQL debug logging
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
