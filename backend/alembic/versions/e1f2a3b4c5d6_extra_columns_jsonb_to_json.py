"""extra_columns: jsonb -> json so the source column ORDER survives

The bid template must mirror the admin's uploaded file column-for-column, in the same
order. It didn't: a drive file uploaded as
    Part Number | Manufacturer | Uid | Serial | Condition | Description
came back to the buyer as
    Uid | Serial | Condition | Description | Part Number | Manufacturer

Cause: these columns are physically `jsonb`, even though the model declares sa.JSON().
jsonb does not store a JSON object as written — it normalises it, and key order is
discarded (it re-emits keys shortest-first, then alphabetically, which is exactly the
order above). Postgres `json` keeps the document verbatim, so Python's insertion-ordered
dict round-trips unchanged.

`json` is the right type here regardless: extra_columns is a pure storage blob. Nothing
queries inside it (no jsonb operators, no GIN index anywhere), so we gain order fidelity
and give up indexing we never used.

Existing rows keep whatever order jsonb already normalised them to — that information is
gone and cannot be recovered. Re-uploading a master file restores correct order.

Revision ID: e1f2a3b4c5d6
Revises: d1e2f3a4b5c6
Create Date: 2026-07-15
"""
import logging

from alembic import op

revision = "e1f2a3b4c5d6"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None

_log = logging.getLogger("alembic.runtime.migration")

_TABLES = ("master_items", "bid_lines")


def _alter(table: str, to_type: str) -> None:
    # USING <col>::<type> makes the cast explicit; jsonb -> json is lossless for values.
    op.execute(
        f"ALTER TABLE {table} "
        f"ALTER COLUMN extra_columns TYPE {to_type} USING extra_columns::{to_type}"
    )


def upgrade():
    # This migration is cosmetic (column ORDER in a generated template). The container runs
    # `alembic upgrade head` on boot, so letting it raise would take the whole API down over a
    # presentation detail. Degrade instead: log loudly and leave the column as-is.
    for table in _TABLES:
        try:
            _alter(table, "json")
        except Exception as exc:
            _log.warning(
                "Could not convert %s.extra_columns to json (%s). Leaving as-is; template "
                "column order will stay normalised until this is applied.", table, exc
            )


def downgrade():
    for table in _TABLES:
        try:
            _alter(table, "jsonb")
        except Exception as exc:
            _log.warning("Could not revert %s.extra_columns to jsonb: %s", table, exc)
