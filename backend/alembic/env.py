import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool, create_engine
from alembic import context

from app.db.base import Base
import app.models  # noqa: F401 — registers all models

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# DATABASE_URL env var overrides the hardcoded alembic.ini URL so Docker works.
_db_url = os.environ.get("DATABASE_URL") or config.get_main_option("sqlalchemy.url")
# configparser treats % as interpolation syntax — escape them so %23 doesn't crash
config.set_main_option("sqlalchemy.url", _db_url.replace("%", "%%"))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=_db_url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_db_url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
