from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest

from buddy_coach.checkin.events import CheckinSaved
from tests.support import VALID_PROFILE, RecordingEventBus, register_and_login

pytestmark = pytest.mark.integration

GOOD = {"sleep_quality": 5, "soreness": 5, "mood": 5}


def _zurich_today() -> date:
    return datetime.now(UTC).astimezone(ZoneInfo("Europe/Zurich")).date()


async def _athlete(client: httpx.AsyncClient, email: str = "athlete@example.com") -> dict[str, str]:
    headers = await register_and_login(client, email)
    response = await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    assert response.status_code == 200, response.text
    return headers


async def test_save_and_read_todays_checkin(
    client: httpx.AsyncClient, event_bus: RecordingEventBus
) -> None:
    headers = await _athlete(client)
    today = _zurich_today().isoformat()

    assert (await client.get("/api/v1/checkins/today", headers=headers)).status_code == 404

    saved = await client.put(
        f"/api/v1/checkins/{today}",
        json={**GOOD, "sleep_hours": 7.5, "hrv_ms": 65, "resting_hr": 48},
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["day"] == today
    assert body["readiness"] == {"score": 100, "level": "green", "limiting_factors": []}

    fetched = await client.get("/api/v1/checkins/today", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json() == body
    assert [e.day.isoformat() for e in event_bus.published if isinstance(e, CheckinSaved)] == [
        today
    ]


async def test_saving_again_replaces_the_day(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    today = _zurich_today().isoformat()
    await client.put(f"/api/v1/checkins/{today}", json=GOOD, headers=headers)
    second = await client.put(
        f"/api/v1/checkins/{today}",
        json={"sleep_quality": 1, "soreness": 1, "mood": 1, "pain": True},
        headers=headers,
    )
    assert second.json()["readiness"]["level"] == "red"
    history = await client.get("/api/v1/checkins", headers=headers)
    assert len(history.json()) == 1


async def test_future_and_too_late_days_are_refused(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    today = _zurich_today()
    tomorrow = (today + timedelta(days=1)).isoformat()
    too_old = (today - timedelta(days=8)).isoformat()
    for day in (tomorrow, too_old):
        response = await client.put(f"/api/v1/checkins/{day}", json=GOOD, headers=headers)
        assert response.status_code == 422, day


@pytest.mark.parametrize(
    "body",
    [
        {"sleep_quality": 0, "soreness": 3, "mood": 3},
        {"sleep_quality": 3, "soreness": 6, "mood": 3},
        {"sleep_quality": 3, "soreness": 3},
        {**GOOD, "resting_hr": 10},
        {**GOOD, "sleep_hours": 20},
    ],
)
async def test_invalid_values_are_refused(
    client: httpx.AsyncClient, body: dict[str, object]
) -> None:
    headers = await _athlete(client)
    response = await client.put(
        f"/api/v1/checkins/{_zurich_today().isoformat()}", json=body, headers=headers
    )
    assert response.status_code == 422


async def test_earlier_days_form_the_resting_hr_baseline_also_in_history(
    client: httpx.AsyncClient,
) -> None:
    headers = await _athlete(client)
    today = _zurich_today()
    for days_back in (3, 2, 1):
        day = (today - timedelta(days=days_back)).isoformat()
        response = await client.put(
            f"/api/v1/checkins/{day}", json={**GOOD, "resting_hr": 48}, headers=headers
        )
        assert response.status_code == 200
    high = await client.put(
        f"/api/v1/checkins/{today.isoformat()}", json={**GOOD, "resting_hr": 62}, headers=headers
    )
    assert "resting_hr" in high.json()["readiness"]["limiting_factors"]

    history = await client.get(
        "/api/v1/checkins",
        params={"from": (today - timedelta(days=1)).isoformat(), "to": today.isoformat()},
        headers=headers,
    )
    days = [c["day"] for c in history.json()]
    assert days == [today.isoformat(), (today - timedelta(days=1)).isoformat()]
    assert history.json()[0]["readiness"] == high.json()["readiness"]


async def test_history_range_is_bounded(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    response = await client.get(
        "/api/v1/checkins", params={"from": "2026-01-01", "to": "2026-12-31"}, headers=headers
    )
    assert response.status_code == 422


async def test_users_only_see_their_own_checkins(client: httpx.AsyncClient) -> None:
    ana = await _athlete(client, "ana@example.com")
    ben = await _athlete(client, "ben@example.com")
    today = _zurich_today().isoformat()
    await client.put(f"/api/v1/checkins/{today}", json=GOOD, headers=ana)

    assert (await client.get(f"/api/v1/checkins/{today}", headers=ben)).status_code == 404
    assert (await client.get("/api/v1/checkins", headers=ben)).json() == []


async def test_without_a_profile_the_day_is_utc(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    utc_today = datetime.now(UTC).date().isoformat()
    response = await client.put(f"/api/v1/checkins/{utc_today}", json=GOOD, headers=headers)
    assert response.status_code == 200


async def test_checkins_need_authentication(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/checkins")).status_code == 401
