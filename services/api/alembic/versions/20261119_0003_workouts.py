"""workouts

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-19 00:40:15.935892+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workouts_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "source",
            sa.Enum(
                "manual",
                "fit_file",
                "apple_health",
                "health_connect",
                "garmin",
                "fitbit",
                "whoop",
                "polar",
                "suunto",
                "coros",
                "huawei",
                "xiaomi",
                "strava",
                name="workout_source",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column(
            "activity",
            sa.Enum(
                "running",
                "trail_running",
                "cycling",
                "indoor_cycling",
                "swimming",
                "walking",
                "hiking",
                "ski_touring",
                "cross_country_skiing",
                "alpine_skiing",
                "rowing",
                "strength",
                "hiit",
                "climbing",
                "yoga",
                "team_sport",
                "other",
                name="activity_type",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("duration_min", sa.Float(), nullable=False),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("elevation_gain_m", sa.Float(), nullable=True),
        sa.Column("avg_hr", sa.Float(), nullable=True),
        sa.Column("max_hr", sa.Float(), nullable=True),
        sa.Column("kcal", sa.Float(), nullable=True),
        sa.Column("rpe", sa.Float(), nullable=True),
        sa.Column("feeling", sa.SmallInteger(), nullable=True),
        sa.Column("pain", sa.Boolean(), nullable=False),
        sa.Column("load", sa.Float(), nullable=False),
        sa.Column(
            "load_source",
            sa.Enum(
                "rpe", "heart_rate", "typical", name="load_source", native_enum=False, length=32
            ),
            nullable=False,
        ),
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
            "duration_min > 0 AND duration_min <= 1440", name=op.f("ck_workouts_sessions_duration")
        ),
        sa.CheckConstraint(
            "feeling IS NULL OR feeling BETWEEN 1 AND 5", name=op.f("ck_workouts_sessions_feeling")
        ),
        sa.CheckConstraint("load >= 0", name=op.f("ck_workouts_sessions_load")),
        sa.CheckConstraint(
            "rpe IS NULL OR rpe BETWEEN 1 AND 10", name=op.f("ck_workouts_sessions_rpe")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workouts_sessions")),
        sa.UniqueConstraint(
            "user_id", "source", "external_id", name="uq_workouts_sessions_source_id"
        ),
    )
    op.create_index(
        "ix_workouts_sessions_user_day", "workouts_sessions", ["user_id", "day"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_workouts_sessions_user_day", table_name="workouts_sessions")
    op.drop_table("workouts_sessions")
