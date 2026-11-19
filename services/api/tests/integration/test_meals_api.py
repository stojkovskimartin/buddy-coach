"""Food diary with a frozen clock: 2026-11-18 23:30 UTC (19 Nov in Zurich)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from buddy_coach.core.deps import get_clock
from tests.support import VALID_PROFILE, register_and_login

pytestmark = pytest.mark.integration

NOW = datetime(2026, 11, 18, 23, 30, tzinfo=UTC)
URL = "/api/v1/meals/entries"


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


def _food(**fields: Any) -> dict[str, Any]:
    return {
        "meal": "breakfast",
        "name": "  Oat flakes ",
        "grams": 80,
        "kcal": 300,
        "protein_g": 10.4,
        "carbs_g": 47.2,
        "fat_g": 5.6,
        **fields,
    }


async def test_entries_land_on_the_athletes_day_with_totals(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    created = await client.post(URL, json=_food(), headers=headers)
    assert created.status_code == 201
    entry = created.json()
    assert (entry["name"], entry["day"], entry["source"]) == ("Oat flakes", "2026-11-19", "manual")

    scanned = _food(
        meal="snack",
        name="Skyr",
        grams=150,
        kcal=95.4,
        protein_g=16.5,
        carbs_g=6,
        fat_g=0.3,
        source="open_food_facts",
        barcode="7613404147010",
        eaten_at="2026-11-18T23:10:00+00:00",
    )
    assert (await client.post(URL, json=scanned, headers=headers)).status_code == 201

    day = (await client.get(URL, headers=headers)).json()
    assert day["day"] == "2026-11-19"
    assert [e["name"] for e in day["entries"]] == ["Skyr", "Oat flakes"]  # in the order eaten
    assert day["totals"] == {"kcal": 395.4, "protein_g": 26.9, "carbs_g": 53.2, "fat_g": 5.9}
    yesterday = (await client.get(URL, params={"day": "2026-11-18"}, headers=headers)).json()
    assert yesterday["entries"] == []


async def test_daily_totals_for_charts(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    await client.post(URL, json=_food(eaten_at="2026-11-10T07:00:00+00:00"), headers=headers)
    await client.post(URL, json=_food(), headers=headers)
    await client.post(URL, json=_food(kcal=100, protein_g=1, carbs_g=1, fat_g=1), headers=headers)
    daily = (
        await client.get("/api/v1/meals/daily", params={"from": "2026-11-01"}, headers=headers)
    ).json()
    assert [(d["day"], d["kcal"]) for d in daily] == [("2026-11-10", 300.0), ("2026-11-19", 400.0)]
    too_long = {"from": "2025-01-01", "to": "2026-11-19"}
    assert (
        await client.get("/api/v1/meals/daily", params=too_long, headers=headers)
    ).status_code == 422


async def test_entries_are_private_and_validated(client: httpx.AsyncClient) -> None:
    owner = await _athlete(client)
    other = await _athlete(client, "other@example.com")
    entry = (await client.post(URL, json=_food(), headers=owner)).json()
    assert (await client.delete(f"{URL}/{entry['id']}", headers=other)).status_code == 404
    assert (await client.get(URL, headers=other)).json()["entries"] == []
    assert (await client.delete(f"{URL}/{entry['id']}", headers=owner)).status_code == 204
    assert (await client.get(URL, headers=owner)).json()["entries"] == []

    for bad in [
        _food(name="   "),
        _food(grams=0),
        _food(barcode="12ab"),
        _food(kcal=1600, grams=100),  # kJ sent as kcal
        _food(eaten_at="2026-11-19T06:00:00+00:00"),  # in the future
    ]:
        assert (await client.post(URL, json=bad, headers=owner)).status_code == 422, bad


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", URL),
        ("POST", URL),
        ("DELETE", f"{URL}/00000000-0000-0000-0000-000000000000"),
        ("GET", "/api/v1/meals/daily"),
    ],
)
async def test_meals_need_authentication(client: httpx.AsyncClient, method: str, path: str) -> None:
    assert (await client.request(method, path, json={})).status_code == 401
