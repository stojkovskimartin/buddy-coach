"""body weights

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-19 11:06:56.214526+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "body_weights",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "source",
            sa.Enum(
                "manual",
                "apple_health",
                "health_connect",
                name="weight_source",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=False),
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
        sa.CheckConstraint(
            "weight_kg >= 30.0 AND weight_kg <= 300.0", name=op.f("ck_body_weights_weight_kg")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_body_weights")),
        sa.UniqueConstraint("user_id", "source", "external_id", name="uq_body_weights_source_id"),
    )
    op.create_index("ix_body_weights_user_day", "body_weights", ["user_id", "day"], unique=False)
    op.create_index(
        "ix_body_weights_user_measured_at", "body_weights", ["user_id", "measured_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_body_weights_user_measured_at", table_name="body_weights")
    op.drop_index("ix_body_weights_user_day", table_name="body_weights")
    op.drop_table("body_weights")
