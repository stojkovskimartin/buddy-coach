"""Workouts and training load with a frozen clock: 2026-11-18 23:30 UTC (19 Nov in Zurich)."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from buddy_coach.core.deps import get_clock
from buddy_coach.workouts.events import WorkoutsChanged
from tests.support import VALID_PROFILE, RecordingEventBus, register_and_login

pytestmark = pytest.mark.integration

NOW = datetime(2026, 11, 18, 23, 30, tzinfo=UTC)


@pytest.fixture(autouse=True)
def frozen_clock(app: FastAPI) -> Iterator[None]:
    app.dependency_overrides[get_clock] = lambda: lambda: NOW
    yield
    app.dependency_overrides.pop(get_clock, None)


async def _athlete(client: httpx.AsyncClient, email: str = "athlete@example.com") -> dict[str, str]:
    headers = await register_and_login(client, email)
    assert (
        await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    ).status_code == 200
    return headers


def _garmin_run(external_id: str = "garmin-1", **fields: Any) -> dict[str, Any]:
    return {
        "source": "garmin",
        "external_id": external_id,
        "activity": "running",
        "started_at": "2026-11-18T23:10:00+00:00",  # 00:10 on 19 Nov in Zurich
        "duration_min": 50,
        "distance_km": 10.2,
        "avg_hr": 160,
        "max_hr": 178,
        "kcal": 720,
        **fields,
    }


async def test_import_is_idempotent_and_keeps_the_athletes_feedback(
    client: httpx.AsyncClient, event_bus: RecordingEventBus
) -> None:
    headers = await _athlete(client)
    first = await client.post(
        "/api/v1/workouts/import", json={"workouts": [_garmin_run()]}, headers=headers
    )
    assert first.json() == {"created": 1, "updated": 0}

    [run] = (await client.get("/api/v1/workouts", headers=headers)).json()
    assert run["day"] == "2026-11-19"  # the athlete's day, not UTC
    assert run["load_source"] == "heart_rate"

    rated = await client.patch(
        f"/api/v1/workouts/{run['id']}/feedback", json={"rpe": 8, "feeling": 2}, headers=headers
    )
    assert rated.json()["load"] == 400
    assert rated.json()["load_source"] == "rpe"

    again = await client.post(
        "/api/v1/workouts/import",
        json={"workouts": [_garmin_run(distance_km=10.4)]},
        headers=headers,
    )
    assert again.json() == {"created": 0, "updated": 1}
    [synced] = (await client.get("/api/v1/workouts", headers=headers)).json()
    assert (synced["distance_km"], synced["rpe"], synced["feeling"], synced["load"]) == (
        10.4,
        8,
        2,
        400,
    )
    assert sum(isinstance(e, WorkoutsChanged) for e in event_bus.published) == 3


async def test_concurrent_syncs_of_the_same_workouts_create_them_once(
    client: httpx.AsyncClient,
) -> None:
    headers = await _athlete(client)
    body = {"workouts": [_garmin_run(str(n)) for n in range(20)]}
    responses = await asyncio.gather(
        *(client.post("/api/v1/workouts/import", json=body, headers=headers) for _ in range(4))
    )
    assert [r.status_code for r in responses] == [200] * 4
    assert sum(r.json()["created"] for r in responses) == 20
    listed = (await client.get("/api/v1/workouts", headers=headers)).json()
    assert len(listed) == 20


async def test_a_device_rpe_never_overwrites_the_athletes_rating(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    await client.post(
        "/api/v1/workouts/import", json={"workouts": [_garmin_run()]}, headers=headers
    )
    [run] = (await client.get("/api/v1/workouts", headers=headers)).json()
    await client.patch(
        f"/api/v1/workouts/{run['id']}/feedback", json={"rpe": 8, "pain": True}, headers=headers
    )
    resync = _garmin_run(rpe=4, feeling=5, pain=False)
    await client.post("/api/v1/workouts/import", json={"workouts": [resync]}, headers=headers)
    [after] = (await client.get("/api/v1/workouts", headers=headers)).json()
    assert (after["rpe"], after["pain"], after["load"]) == (8, True, 400)
    assert after["feeling"] == 5  # was empty, so the device may fill it


async def test_future_workouts_are_refused(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    later = _garmin_run(started_at="2026-11-19T02:00:00+00:00")  # 2.5 h after "now"
    response = await client.post(
        "/api/v1/workouts/import", json={"workouts": [later]}, headers=headers
    )
    assert response.status_code == 422
    drift = _garmin_run(started_at="2026-11-19T00:15:00+00:00")  # 45 min clock drift is fine
    response = await client.post(
        "/api/v1/workouts/import", json={"workouts": [drift]}, headers=headers
    )
    assert response.status_code == 200


async def test_easy_long_activities_stay_out_of_the_load_summary(
    client: httpx.AsyncClient,
) -> None:
    headers = await _athlete(client)
    ski_day = {
        "source": "apple_health",
        "external_id": "ski",
        "activity": "alpine_skiing",
        "started_at": "2026-11-18T09:00:00+01:00",
        "duration_min": 360,
    }
    await client.post("/api/v1/workouts/import", json={"workouts": [ski_day]}, headers=headers)
    load = (await client.get("/api/v1/training/load", headers=headers)).json()
    assert load["ramp"]["this_week_load"] == 0
    assert "alpine_skiing" in load["excluded_activities"]
    assert len((await client.get("/api/v1/workouts", headers=headers)).json()) == 1


async def test_the_same_id_from_two_sources_is_two_workouts(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    body = {"workouts": [_garmin_run("1"), {**_garmin_run("1"), "source": "strava"}]}
    assert (await client.post("/api/v1/workouts/import", json=body, headers=headers)).json() == {
        "created": 2,
        "updated": 0,
    }


async def test_manual_workout_and_delete(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    created = await client.post(
        "/api/v1/workouts",
        json={
            "activity": "strength",
            "started_at": "2026-11-18T18:00:00+01:00",
            "duration_min": 45,
            "rpe": 6,
            "pain": True,
        },
        headers=headers,
    )
    assert created.status_code == 201
    body = created.json()
    assert (body["source"], body["load"], body["pain"], body["day"]) == (
        "manual",
        270,
        True,
        "2026-11-18",
    )
    deleted = await client.delete(f"/api/v1/workouts/{body['id']}", headers=headers)
    assert deleted.status_code == 204
    assert (await client.get("/api/v1/workouts", headers=headers)).json() == []
    again = await client.delete(f"/api/v1/workouts/{body['id']}", headers=headers)
    assert again.status_code == 404


async def test_training_load_summary(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    # A 50-minute run at RPE 5 every morning from 1 to 18 Nov ("now" is 00:30 on 19 Nov).
    workouts = [
        _garmin_run(f"run-{day}", started_at=f"2026-11-{day:02d}T07:00:00+01:00", rpe=5)
        for day in range(1, 19)
    ]
    imported = await client.post(
        "/api/v1/workouts/import", json={"workouts": workouts}, headers=headers
    )
    assert imported.json() == {"created": 18, "updated": 0}

    load = (await client.get("/api/v1/training/load", params={"days": 14}, headers=headers)).json()
    assert len(load["days"]) == 14
    assert load["today"]["day"] == "2026-11-19"
    assert load["today"]["load"] == 0
    assert load["days"][-2]["load"] == 250  # 50 min x RPE 5
    assert load["ramp"]["this_week_load"] == 1500  # 13-19 Nov, today not trained yet
    assert load["ramp"]["last_week_load"] == 1750
    assert load["ramp"]["verdict"] == "ok"
    assert load["today"]["fitness"] > 0


@pytest.mark.parametrize(
    "workout",
    [
        _garmin_run(started_at="2026-11-18T23:10:00"),  # no offset
        _garmin_run(duration_min=0),
        _garmin_run(avg_hr=170, max_hr=150),
        _garmin_run(source="myspace"),
        _garmin_run(rpe=11),
    ],
)
async def test_invalid_workouts_are_refused(
    client: httpx.AsyncClient, workout: dict[str, Any]
) -> None:
    headers = await _athlete(client)
    response = await client.post(
        "/api/v1/workouts/import", json={"workouts": [workout]}, headers=headers
    )
    assert response.status_code == 422


async def test_batches_are_bounded(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    too_many = {"workouts": [_garmin_run(str(n)) for n in range(501)]}
    response = await client.post("/api/v1/workouts/import", json=too_many, headers=headers)
    assert response.status_code == 422


async def test_users_only_see_and_change_their_own_workouts(client: httpx.AsyncClient) -> None:
    ana = await _athlete(client, "ana@example.com")
    ben = await _athlete(client, "ben@example.com")
    await client.post("/api/v1/workouts/import", json={"workouts": [_garmin_run()]}, headers=ana)
    [run] = (await client.get("/api/v1/workouts", headers=ana)).json()

    assert (await client.get("/api/v1/workouts", headers=ben)).json() == []
    patch = await client.patch(
        f"/api/v1/workouts/{run['id']}/feedback", json={"rpe": 2}, headers=ben
    )
    assert patch.status_code == 404
    assert (await client.delete(f"/api/v1/workouts/{run['id']}", headers=ben)).status_code == 404
    # Ben importing the same Garmin id creates his own workout, never touches Ana's.
    mine = await client.post(
        "/api/v1/workouts/import", json={"workouts": [_garmin_run()]}, headers=ben
    )
    assert mine.json() == {"created": 1, "updated": 0}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/v1/workouts"),
        ("POST", "/api/v1/workouts"),
        ("POST", "/api/v1/workouts/import"),
        ("GET", "/api/v1/training/load"),
    ],
)
async def test_workouts_need_authentication(
    client: httpx.AsyncClient, method: str, path: str
) -> None:
    assert (await client.request(method, path, json={})).status_code == 401
