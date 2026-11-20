from __future__ import annotations

from datetime import UTC, date, datetime
from importlib import resources

from buddy_coach.core.clock import local_date


def test_time_zones_ship_with_the_app() -> None:
    # Windows has no system time zone database: the ``tzdata`` package must provide it.
    assert resources.files("tzdata.zoneinfo").joinpath("Europe", "Zurich").is_file()


def test_local_date_uses_the_athletes_time_zone() -> None:
    late_evening_utc = datetime(2026, 6, 30, 23, 30, tzinfo=UTC)
    assert local_date(late_evening_utc, "Europe/Zurich") == date(2026, 7, 1)


def test_local_date_falls_back_to_utc_without_a_time_zone() -> None:
    late_evening_utc = datetime(2026, 6, 30, 23, 30, tzinfo=UTC)
    assert local_date(late_evening_utc, None) == date(2026, 6, 30)
