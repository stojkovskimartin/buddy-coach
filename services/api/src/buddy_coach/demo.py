"""Demo data for trying every screen by clicking.

Run ``uv run --env-file .env python -m buddy_coach.demo`` in ``services/api``.

Creates one demo athlete with about four months of check-ins, workouts, weigh-ins and meals. All
data goes through the public HTTP API in-process, with the app's clock set to each past day, so
every rule applies exactly as for a real user. Refuses to run in production.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import random
import sys
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI

from buddy_coach.core.config import Environment, get_settings
from buddy_coach.core.deps import get_clock
from buddy_coach.main import API_PREFIX, create_app

DEFAULT_EMAIL = "demo@example.com"
DEFAULT_PASSWORD = "demo-password-2026"  # noqa: S105  # a public demo login, dev only
DAYS = 120
ZURICH = ZoneInfo("Europe/Zurich")

PROFILE = {
    "birth_year": 1998,
    "sex": "male",
    "height_cm": 182,
    "weight_kg": 80.5,
    "experience": "intermediate",
    "coach_style": "friendly",
    "available_days_per_week": 5,
    "minutes_per_session": 70,
    "timezone": "Europe/Zurich",
    "locale": "en",
}

# A week of training: (activity, minutes, avg HR, km per minute or None)
WEEK: list[tuple[str, int, int, float | None] | None] = [
    ("running", 45, 148, 0.18),
    ("strength", 50, 118, None),
    ("cycling", 75, 135, 0.45),
    None,
    ("swimming", 40, 132, 0.04),
    ("running", 95, 142, 0.17),
    None,
]

MEALS = {
    "breakfast": [
        ("Oat flakes with milk", 300, 380, 15, 55, 10),
        ("Greek yoghurt with berries", 250, 240, 20, 22, 8),
        ("Wholegrain bread with eggs", 220, 420, 24, 38, 18),
    ],
    "lunch": [
        ("Chicken, rice and vegetables", 450, 640, 45, 78, 14),
        ("Pasta with tomato sauce and tuna", 420, 610, 34, 88, 12),
        ("Lentil soup with bread", 500, 520, 26, 80, 9),
    ],
    "dinner": [
        ("Salmon, potatoes and broccoli", 480, 650, 40, 55, 26),
        ("Beef stir-fry with noodles", 450, 700, 42, 75, 22),
        ("Vegetable curry with rice", 500, 620, 18, 95, 16),
    ],
    "snack": [
        ("Banana", 120, 105, 1, 27, 0),
        ("Protein shake", 330, 180, 30, 8, 3),
        ("Mixed nuts", 30, 180, 6, 6, 15),
    ],
}


def _at(day: date, hour: int, minute: int = 0) -> datetime:
    # Zurich is UTC+1 in winter and UTC+2 in summer; one hour off in summer is fine for demo data.
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=UTC) - timedelta(hours=1)


class Demo:
    """Writes the demo athlete through the API, moving the clock day by day."""

    def __init__(
        self, app: FastAPI, client: httpx.AsyncClient, now: datetime, today: date, days: int
    ) -> None:
        self._app = app
        self._now = now  # nothing is dated after the real time
        self._days = days
        self._client = client
        self._today = today
        self._rng = random.Random(2026)  # noqa: S311  # the same demo data every time, not security
        self._headers: dict[str, str] = {}

    def _clock(self, at: datetime) -> None:
        now = min(at, self._now)
        clock: Callable[[], datetime] = lambda: now  # noqa: E731
        self._app.dependency_overrides[get_clock] = lambda: clock

    async def _call(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        response = await self._client.request(
            method, f"{API_PREFIX}{path}", headers=self._headers, **kwargs
        )
        if response.status_code >= 400:
            msg = f"{method} {path} failed: {response.status_code} {response.text}"
            raise RuntimeError(msg)
        return response

    async def account(self, email: str, password: str) -> bool:
        """Register and log in; False when the account exists already."""
        self._clock(_at(self._today, 8))
        registered = await self._client.post(
            f"{API_PREFIX}/auth/register", json={"email": email, "password": password}
        )
        if registered.status_code == httpx.codes.CONFLICT:
            return False
        if registered.status_code != httpx.codes.CREATED:
            msg = f"registering the demo athlete failed: {registered.text}"
            raise RuntimeError(msg)
        tokens = (
            await self._call("POST", "/auth/login", json={"email": email, "password": password})
        ).json()
        self._headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        return True

    async def profile_and_goals(self) -> None:
        await self._call("PUT", "/profile", json=PROFILE)
        await self._call(
            "POST",
            "/goals",
            json={
                "goal_type": "endurance_event",
                "title": "Half Ironman 70.3",
                "sport": "triathlon",
                "event_distance_km": 113,
                "target_date": (self._today + timedelta(days=210)).isoformat(),
                "priority": "primary",
            },
        )
        await self._call(
            "POST",
            "/goals",
            json={
                "goal_type": "lose_weight",
                "title": "Race weight",
                "target_weight_kg": 77,
                "priority": "secondary",
            },
        )

    async def day(self, day: date, index: int) -> None:
        rng = self._rng
        progress = index / max(1, self._days - 1)  # 0 at the start, 1 today
        if _at(day, 7, 30) > self._now:  # seeded before this morning's check-in
            return
        self._clock(_at(day, 7, 30))
        sleep = rng.choice([3, 4, 4, 4, 5])
        await self._call(
            "PUT",
            "/checkins/today",
            json={
                "sleep_quality": sleep,
                "soreness": rng.choice([2, 3, 4, 4, 5]),
                "mood": rng.choice([3, 4, 4, 5]),
                "sleep_hours": round(6 + sleep * 0.5 + rng.uniform(-0.5, 0.5), 1),
                "hrv_ms": round(55 + 10 * progress + rng.uniform(-8, 8)),
                "resting_hr": round(54 - 3 * progress + rng.uniform(-2, 2)),
            },
        )
        if rng.random() < 0.75:  # most mornings on the scale
            kg = 80.5 - 2.3 * progress + rng.uniform(-0.4, 0.4)
            await self._call(
                "POST",
                "/body/weights",
                json={"weight_kg": round(kg, 1), "measured_at": _at(day, 7).isoformat()},
            )
        session = WEEK[day.weekday()]
        if session and rng.random() < 0.9:
            activity, minutes, hr, km_per_min = session
            minutes = round(minutes * rng.uniform(0.85, 1.15))
            if _at(day, 18) + timedelta(minutes=minutes) <= self._now:  # not later than now
                self._clock(_at(day, 20))
                await self._call(
                    "POST",
                    "/workouts/import",
                    json={
                        "workouts": [
                            {
                                "source": "apple_health",
                                "external_id": f"demo-{day.isoformat()}",
                                "activity": activity,
                                "started_at": _at(day, 18).isoformat(),
                                "duration_min": minutes,
                                "distance_km": round(minutes * km_per_min, 1)
                                if km_per_min
                                else None,
                                "avg_hr": hr + rng.randint(-6, 6),
                                "max_hr": hr + 25 + rng.randint(-5, 5),
                                "rpe": rng.choice([4, 5, 6, 7]),
                            }
                        ]
                    },
                )
        self._clock(_at(day, 22))
        for meal, hour in (("breakfast", 7), ("lunch", 12), ("dinner", 19), ("snack", 16)):
            if (meal == "snack" and rng.random() < 0.4) or _at(day, hour) > self._now:
                continue
            name, grams, kcal, protein, carbs, fat = rng.choice(MEALS[meal])
            await self._call(
                "POST",
                "/meals/entries",
                json={
                    "meal": meal,
                    "name": name,
                    "grams": grams,
                    "kcal": kcal,
                    "protein_g": protein,
                    "carbs_g": carbs,
                    "fat_g": fat,
                    "eaten_at": _at(day, hour).isoformat(),
                },
            )


async def seed(
    email: str, password: str, now: datetime, *, days: int = DAYS, app: FastAPI | None = None
) -> bool:
    """Create the demo athlete with ``days`` days of data up to ``now``; False when it exists
    already. Tests pass their own app."""
    own = app is None
    app = app or create_app()
    if app.state.settings.environment not in (Environment.DEVELOPMENT, Environment.TEST):
        msg = "Demo data is for development only."
        raise RuntimeError(msg)
    today = now.astimezone(ZURICH).date()
    previous = app.dependency_overrides.get(get_clock)
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://demo") as client:
            demo = Demo(app, client, now, today, days)
            if not await demo.account(email, password):
                return False
            await demo.profile_and_goals()
            for index in range(days):
                await demo.day(today - timedelta(days=days - 1 - index), index)
        return True
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_clock, None)
        else:
            app.dependency_overrides[get_clock] = previous
        if own:
            await app.state.http.aclose()
            await app.state.db.dispose()


def main() -> None:
    """Command line entry point."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--password", default=DEFAULT_PASSWORD)
    args = parser.parse_args()
    if get_settings().environment is not Environment.DEVELOPMENT:
        sys.exit("Demo data is for development only (BUDDY_ENVIRONMENT=development).")
    for noisy in ("httpx", "buddy_coach.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    if asyncio.run(seed(args.email, args.password, datetime.now(UTC))):
        print(f"Demo athlete ready. Log in with {args.email} / {args.password}")
    else:
        print(f"{args.email} exists already: log in with it, or pass another --email.")


if __name__ == "__main__":
    main()
