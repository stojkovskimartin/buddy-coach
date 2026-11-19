"""photos

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-19 14:47:15.993448+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "media_photos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("meal", "progress", "avatar", name="photo_kind", native_enum=False, length=32),
            nullable=False,
        ),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_media_photos")),
    )
    op.create_index(
        "ix_media_photos_user_kind_day", "media_photos", ["user_id", "kind", "day"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_media_photos_user_kind_day", table_name="media_photos")
    op.drop_table("media_photos")
