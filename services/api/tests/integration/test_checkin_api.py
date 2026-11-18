"""Check-in endpoints with a frozen clock: 2026-11-18 23:30 UTC, already 19 Nov in Zurich."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from fastapi import FastAPI

from buddy_coach.checkin.events import CheckinSaved
from buddy_coach.core.deps import get_clock
from tests.support import VALID_PROFILE, RecordingEventBus, register_and_login

pytestmark = pytest.mark.integration

NOW = datetime(2026, 11, 18, 23, 30, tzinfo=UTC)
ZURICH_TODAY = date(2026, 11, 19)
UTC_TODAY = date(2026, 11, 18)
GOOD = {"sleep_quality": 5, "soreness": 5, "mood": 5}


@pytest.fixture(autouse=True)
def frozen_clock(app: FastAPI) -> Iterator[None]:
    app.dependency_overrides[get_clock] = lambda: lambda: NOW
    yield
    app.dependency_overrides.pop(get_clock, None)


def _url(day: date | str) -> str:
    return f"/api/v1/checkins/{day.isoformat() if isinstance(day, date) else day}"


async def _athlete(client: httpx.AsyncClient, email: str = "athlete@example.com") -> dict[str, str]:
    headers = await register_and_login(client, email)
    response = await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    assert response.status_code == 200, response.text
    return headers


async def test_save_and_read_todays_checkin_in_the_athletes_time_zone(
    client: httpx.AsyncClient, event_bus: RecordingEventBus
) -> None:
    headers = await _athlete(client)  # Europe/Zurich
    assert (await client.get("/api/v1/checkins/today", headers=headers)).status_code == 404

    saved = await client.put(
        _url(ZURICH_TODAY),
        json={**GOOD, "sleep_hours": 7.5, "hrv_ms": 65, "resting_hr": 48},
        headers=headers,
    )
    assert saved.status_code == 201, saved.text
    body = saved.json()
    assert body["day"] == "2026-11-19"
    assert body["readiness"] == {"score": 100, "level": "green", "limiting_factors": []}

    for path in ("/api/v1/checkins/today", _url(ZURICH_TODAY)):
        fetched = await client.get(path, headers=headers)
        assert fetched.status_code == 200
        assert fetched.json() == body
    assert [e.day for e in event_bus.published if isinstance(e, CheckinSaved)] == [ZURICH_TODAY]


async def test_put_today_uses_the_athletes_day(client: httpx.AsyncClient) -> None:
    zurich = await _athlete(client, "zurich@example.com")
    created = await client.put("/api/v1/checkins/today", json=GOOD, headers=zurich)
    assert created.status_code == 201
    assert created.json()["day"] == "2026-11-19"
    again = await client.put("/api/v1/checkins/today", json=GOOD, headers=zurich)
    assert again.status_code == 200

    no_profile = await register_and_login(client, "new@example.com")
    utc = await client.put("/api/v1/checkins/today", json=GOOD, headers=no_profile)
    assert utc.json()["day"] == "2026-11-18"


async def test_saving_again_replaces_the_day(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    assert (await client.put(_url(ZURICH_TODAY), json=GOOD, headers=headers)).status_code == 201
    second = await client.put(
        _url(ZURICH_TODAY),
        json={"sleep_quality": 1, "soreness": 1, "mood": 1, "pain": True},
        headers=headers,
    )
    assert second.status_code == 200
    assert second.json()["readiness"]["level"] == "red"
    history = await client.get("/api/v1/checkins", headers=headers)
    assert [c["day"] for c in history.json()] == ["2026-11-19"]


@pytest.mark.parametrize(
    "day", [ZURICH_TODAY + timedelta(days=1), ZURICH_TODAY - timedelta(days=8)]
)
async def test_future_and_too_late_days_are_refused(client: httpx.AsyncClient, day: date) -> None:
    headers = await _athlete(client)
    response = await client.put(_url(day), json=GOOD, headers=headers)
    assert response.status_code == 422


async def test_seven_days_late_is_still_accepted(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    response = await client.put(_url(ZURICH_TODAY - timedelta(days=7)), json=GOOD, headers=headers)
    assert response.status_code == 201


async def test_without_a_profile_today_is_the_utc_day(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    assert (await client.put(_url(UTC_TODAY), json=GOOD, headers=headers)).status_code == 201
    # The Zurich day is still in the future in UTC.
    assert (await client.put(_url(ZURICH_TODAY), json=GOOD, headers=headers)).status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {"sleep_quality": 0, "soreness": 3, "mood": 3},
        {"sleep_quality": 3, "soreness": 6, "mood": 3},
        {"sleep_quality": 3, "soreness": 3},
        {**GOOD, "resting_hr": 10},
        {**GOOD, "sleep_hours": 20},
        {**GOOD, "hrv_ms": 0},
    ],
)
async def test_invalid_values_are_refused(
    client: httpx.AsyncClient, body: dict[str, object]
) -> None:
    headers = await _athlete(client)
    assert (await client.put(_url(ZURICH_TODAY), json=body, headers=headers)).status_code == 422


async def test_earlier_days_form_the_resting_hr_baseline_also_in_history(
    client: httpx.AsyncClient,
) -> None:
    headers = await _athlete(client)
    for days_back in (3, 2, 1):
        day = ZURICH_TODAY - timedelta(days=days_back)
        response = await client.put(_url(day), json={**GOOD, "resting_hr": 48}, headers=headers)
        assert response.status_code == 201
    high = await client.put(_url(ZURICH_TODAY), json={**GOOD, "resting_hr": 62}, headers=headers)
    assert "resting_hr" in high.json()["readiness"]["limiting_factors"]

    history = await client.get(
        "/api/v1/checkins",
        params={"from": "2026-11-18", "to": "2026-11-19"},
        headers=headers,
    )
    assert [c["day"] for c in history.json()] == ["2026-11-19", "2026-11-18"]
    assert history.json()[0]["readiness"] == high.json()["readiness"]
    single = await client.get(_url(ZURICH_TODAY), headers=headers)
    assert single.json()["readiness"] == high.json()["readiness"]


async def test_hrv_counts_after_seven_earlier_values(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    for days_back, hrv in zip(range(7, 0, -1), (68, 70, 72, 69, 71, 70, 73), strict=True):
        day = ZURICH_TODAY - timedelta(days=days_back)
        response = await client.put(_url(day), json={**GOOD, "hrv_ms": hrv}, headers=headers)
        assert response.status_code == 201
    low = await client.put(_url(ZURICH_TODAY), json={**GOOD, "hrv_ms": 35}, headers=headers)
    assert "hrv" in low.json()["readiness"]["limiting_factors"]


async def test_history_defaults_to_two_weeks_and_is_bounded(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    await client.put(_url(ZURICH_TODAY), json=GOOD, headers=headers)
    assert len((await client.get("/api/v1/checkins", headers=headers)).json()) == 1
    too_long = await client.get(
        "/api/v1/checkins", params={"from": "2026-01-01", "to": "2026-12-31"}, headers=headers
    )
    assert too_long.status_code == 422
    backwards = await client.get(
        "/api/v1/checkins", params={"from": "2026-11-19", "to": "2026-11-01"}, headers=headers
    )
    assert backwards.status_code == 422
    assert "before it starts" in backwards.json()["detail"]


async def test_users_only_see_their_own_checkins(client: httpx.AsyncClient) -> None:
    ana = await _athlete(client, "ana@example.com")
    ben = await _athlete(client, "ben@example.com")
    await client.put(_url(ZURICH_TODAY), json=GOOD, headers=ana)

    assert (await client.get(_url(ZURICH_TODAY), headers=ben)).status_code == 404
    assert (await client.get("/api/v1/checkins", headers=ben)).json() == []


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/v1/checkins"),
        ("GET", "/api/v1/checkins/today"),
        ("GET", "/api/v1/checkins/2026-11-19"),
        ("PUT", "/api/v1/checkins/2026-11-19"),
        ("PUT", "/api/v1/checkins/today"),
    ],
)
async def test_checkins_need_authentication(
    client: httpx.AsyncClient, method: str, path: str
) -> None:
    response = await client.request(method, path, json=GOOD)
    assert response.status_code == 401
