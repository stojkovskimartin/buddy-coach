"""meals

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-19 11:31:50.198370+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meals_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("eaten_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column(
            "meal",
            sa.Enum(
                "breakfast",
                "lunch",
                "dinner",
                "snack",
                name="meal_slot",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("grams", sa.Float(), nullable=False),
        sa.Column("kcal", sa.Float(), nullable=False),
        sa.Column("protein_g", sa.Float(), nullable=False),
        sa.Column("carbs_g", sa.Float(), nullable=False),
        sa.Column("fat_g", sa.Float(), nullable=False),
        sa.Column(
            "source",
            sa.Enum("manual", "open_food_facts", name="food_source", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("barcode", sa.String(length=32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("grams > 0 AND grams <= 5000.0", name=op.f("ck_meals_entries_grams")),
        sa.CheckConstraint(
            "kcal >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0",
            name=op.f("ck_meals_entries_nutrients"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_meals_entries")),
    )
    op.create_index("ix_meals_entries_user_day", "meals_entries", ["user_id", "day"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_meals_entries_user_day", table_name="meals_entries")
    op.drop_table("meals_entries")
