"""daily check-ins

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-18 19:59:23.760434+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "checkin_daily",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("sleep_quality", sa.SmallInteger(), nullable=False),
        sa.Column("soreness", sa.SmallInteger(), nullable=False),
        sa.Column("mood", sa.SmallInteger(), nullable=False),
        sa.Column("sleep_hours", sa.Float(), nullable=True),
        sa.Column("hrv_ms", sa.Float(), nullable=True),
        sa.Column("resting_hr", sa.Float(), nullable=True),
        sa.Column("pain", sa.Boolean(), nullable=False),
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
        sa.CheckConstraint("mood BETWEEN 1 AND 5", name=op.f("ck_checkin_daily_mood")),
        sa.CheckConstraint(
            "sleep_hours BETWEEN 0 AND 16", name=op.f("ck_checkin_daily_sleep_hours")
        ),
        sa.CheckConstraint("hrv_ms > 0 AND hrv_ms <= 300", name=op.f("ck_checkin_daily_hrv_ms")),
        sa.CheckConstraint(
            "resting_hr BETWEEN 25 AND 150", name=op.f("ck_checkin_daily_resting_hr")
        ),
        sa.CheckConstraint(
            "sleep_quality BETWEEN 1 AND 5", name=op.f("ck_checkin_daily_sleep_quality")
        ),
        sa.CheckConstraint("soreness BETWEEN 1 AND 5", name=op.f("ck_checkin_daily_soreness")),
        sa.PrimaryKeyConstraint("user_id", "day", name=op.f("pk_checkin_daily")),
    )


def downgrade() -> None:
    op.drop_table("checkin_daily")
