"""The demo athlete goes through the public API, so it shows up like real data."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
from fastapi import FastAPI

from buddy_coach.demo import seed

pytestmark = pytest.mark.integration

NOW = datetime(2026, 11, 19, 21, 0, tzinfo=UTC)  # 22:00 in Zurich


async def test_the_demo_athlete_has_data_on_every_screen(
    app: FastAPI, client: httpx.AsyncClient
) -> None:
    assert await seed("demo@example.com", "demo-password-2026", NOW, days=14, app=app)
    assert not await seed("demo@example.com", "demo-password-2026", NOW, days=14, app=app)

    login = await client.post(
        "/api/v1/auth/login", json={"email": "demo@example.com", "password": "demo-password-2026"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    period = {"from": "2026-11-06", "to": "2026-11-19"}
    checkins = (await client.get("/api/v1/checkins", params=period, headers=headers)).json()
    weights = (await client.get("/api/v1/body/weights", params=period, headers=headers)).json()
    food = (await client.get("/api/v1/meals/daily", params=period, headers=headers)).json()
    workouts = (await client.get("/api/v1/workouts", params=period, headers=headers)).json()
    goals = (await client.get("/api/v1/goals", headers=headers)).json()

    assert len(checkins) == 14
    assert len(food) == 14
    assert weights["weights"]
    assert weights["trend"]
    assert len(workouts) >= 6
    assert [g["title"] for g in goals] == ["Race weight", "Half Ironman 70.3"]


async def test_nothing_is_dated_after_the_real_time(
    app: FastAPI, client: httpx.AsyncClient
) -> None:
    morning = datetime(2026, 11, 19, 9, 0, tzinfo=UTC)  # 10:00 in Zurich
    assert await seed("early@example.com", "demo-password-2026", morning, days=2, app=app)

    login = await client.post(
        "/api/v1/auth/login", json={"email": "early@example.com", "password": "demo-password-2026"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    today = (
        await client.get("/api/v1/meals/entries", params={"day": "2026-11-19"}, headers=headers)
    ).json()
    assert [e["meal"] for e in today["entries"]] == ["breakfast"]
