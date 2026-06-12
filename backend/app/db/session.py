from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,   # verify connection alive before use
    pool_size=5,
    max_overflow=10,
    pool_recycle=280,     # recycle before Render's 5-min idle timeout kills the connection
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
