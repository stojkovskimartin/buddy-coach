"""Data export and account deletion, across every table that holds user data."""

from __future__ import annotations

import io
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI
from PIL import Image
from sqlalchemy import func, select

from buddy_coach.core.db import Database
from buddy_coach.core.deps import get_clock
from buddy_coach.demo import seed
from buddy_coach.meals.service import MealService
from buddy_coach.media.deps import get_photo_storage
from buddy_coach.media.storage import LocalPhotoStorage
from buddy_coach.models_registry import Base
from tests.support import make_settings

pytestmark = pytest.mark.integration

NOW = datetime(2026, 11, 19, 21, 0, tzinfo=UTC)
PASSWORD = "demo-password-2026"
EXCLUDED_KEYS = {
    "password_hash",
    "is_active",
    "jti_hash",
    "refresh_token",
    "access_token",
    "access_expires_at",
    "cursor",
}


@pytest.fixture(autouse=True)
def setup(app: FastAPI, tmp_path: Path) -> Iterator[Path]:
    app.state.settings = make_settings(
        database_url=app.state.settings.database_url,
        integrations_key=Fernet.generate_key().decode(),
        fake_providers=True,
    )
    app.dependency_overrides[get_photo_storage] = lambda: LocalPhotoStorage(str(tmp_path))
    yield tmp_path
    app.dependency_overrides.clear()


class Athlete:
    def __init__(self, user_id: uuid.UUID, access: str, refresh: str) -> None:
        self.id = user_id
        self.access = access
        self.refresh = refresh
        self.headers = {"Authorization": f"Bearer {access}"}


async def _seeded(app: FastAPI, client: httpx.AsyncClient, email: str) -> Athlete:
    assert await seed(email, PASSWORD, NOW, days=3, app=app)
    app.dependency_overrides[get_clock] = lambda: lambda: NOW
    tokens = (
        await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    ).json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    me = (await client.get("/api/v1/users/me", headers=headers)).json()
    return Athlete(uuid.UUID(me["id"]), tokens["access_token"], tokens["refresh_token"])


async def _with_photo_and_connection(client: httpx.AsyncClient, athlete: Athlete) -> None:
    image = io.BytesIO()
    Image.new("RGB", (800, 600), "green").save(image, format="JPEG")
    photo = await client.post(
        "/api/v1/photos",
        params={"kind": "progress"},
        content=image.getvalue(),
        headers={**athlete.headers, "Content-Type": "image/jpeg"},
    )
    assert photo.status_code == 201, photo.text
    started = await client.post("/api/v1/integrations/withings/connect", headers=athlete.headers)
    query = {k: v[0] for k, v in parse_qs(urlsplit(started.json()["authorize_url"]).query).items()}
    connected = await client.post(
        "/api/v1/integrations/withings/callback", json=query, headers=athlete.headers
    )
    assert connected.status_code == 200, connected.text


async def _rows(app: FastAPI, user_id: uuid.UUID) -> dict[str, int]:
    """Rows of the user in every table with a ``user_id`` column, and the account itself."""
    database: Database = app.state.db
    counts: dict[str, int] = {}
    async with database.session_factory() as session:
        for table in Base.metadata.sorted_tables:
            column = table.c.get("user_id")
            if table.name == "identity_users":
                column = table.c.id
            if column is None:
                continue
            query = select(func.count()).select_from(table).where(column == user_id)
            counts[table.name] = (await session.execute(query)).scalar_one()
    return counts


async def _two_athletes(app: FastAPI, client: httpx.AsyncClient) -> tuple[Athlete, Athlete]:
    a = await _seeded(app, client, "a@example.com")
    await _with_photo_and_connection(client, a)
    b = await _seeded(app, client, "b@example.com")
    return a, b


async def test_deleting_an_account_removes_every_row_and_file(
    app: FastAPI, client: httpx.AsyncClient, setup: Path
) -> None:
    a, b = await _two_athletes(app, client)
    before_a = await _rows(app, a.id)
    before_b = await _rows(app, b.id)
    # Every table with user data has rows for A, so the test proves each one is erased: a new
    # table makes this fail until the seed above fills it and its module erases it.
    assert all(count > 0 for count in before_a.values()), before_a
    assert (setup / str(a.id)).is_dir()

    response = await client.post(
        "/api/v1/account/delete", json={"password": PASSWORD}, headers=a.headers
    )

    assert response.status_code == 204, response.text
    assert await _rows(app, a.id) == dict.fromkeys(before_a, 0)
    assert await _rows(app, b.id) == before_b
    assert not (setup / str(a.id)).exists()
    assert (await client.get("/api/v1/users/me", headers=a.headers)).status_code == 401
    refresh = await client.post("/api/v1/auth/refresh", json={"refresh_token": a.refresh})
    assert refresh.status_code == 401
    login = await client.post(
        "/api/v1/auth/login", json={"email": "a@example.com", "password": PASSWORD}
    )
    assert login.status_code == 401
    assert (await client.get("/api/v1/users/me", headers=b.headers)).status_code == 200


async def test_a_wrong_password_is_403_and_changes_nothing(
    app: FastAPI, client: httpx.AsyncClient, setup: Path
) -> None:
    a, _ = await _two_athletes(app, client)
    before = await _rows(app, a.id)

    response = await client.post(
        "/api/v1/account/delete", json={"password": "not-the-password"}, headers=a.headers
    )

    assert response.status_code == 403
    assert response.json()["code"] == "invalid_password"
    assert await _rows(app, a.id) == before
    assert (setup / str(a.id)).is_dir()
    assert (await client.get("/api/v1/users/me", headers=a.headers)).status_code == 200
    refresh = await client.post("/api/v1/auth/refresh", json={"refresh_token": a.refresh})
    assert refresh.status_code == 200


async def test_a_failed_deletion_unblocks_the_account_for_a_retry(
    app: FastAPI, client: httpx.AsyncClient, setup: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, _ = await _two_athletes(app, client)
    before = await _rows(app, a.id)

    async def broken(self: MealService, user_id: uuid.UUID) -> None:
        raise RuntimeError("database hiccup")

    monkeypatch.setattr(MealService, "erase_user", broken)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as failing:
        response = await failing.post(
            "/api/v1/account/delete", json={"password": PASSWORD}, headers=a.headers
        )
    assert response.status_code == 500

    after = await _rows(app, a.id)
    # Only the refresh tokens changed: revoked, not deleted.
    assert after == before
    assert (setup / str(a.id)).is_dir()
    refresh = await client.post("/api/v1/auth/refresh", json={"refresh_token": a.refresh})
    assert refresh.status_code == 401
    login = await client.post(
        "/api/v1/auth/login", json={"email": "a@example.com", "password": PASSWORD}
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    monkeypatch.undo()
    retry = await client.post(
        "/api/v1/account/delete", json={"password": PASSWORD}, headers=headers
    )
    assert retry.status_code == 204
    assert await _rows(app, a.id) == dict.fromkeys(before, 0)
    assert not (setup / str(a.id)).exists()


async def test_deleting_needs_a_login(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/account/delete", json={"password": PASSWORD})
    assert response.status_code == 401


def _keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {k for v in value.values() for k in _keys(v)}
    if isinstance(value, list):
        return {k for v in value for k in _keys(v)}
    return set()


async def test_the_export_has_every_section_and_no_secrets(
    app: FastAPI, client: httpx.AsyncClient
) -> None:
    a, _ = await _two_athletes(app, client)
    counts = await _rows(app, a.id)

    response = await client.get("/api/v1/privacy/export", headers=a.headers)

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.headers["content-disposition"] == (
        'attachment; filename="buddy-coach-export-2026-11-19.json"'
    )
    data = response.json()
    assert data["account"] == {
        "email": "a@example.com",
        "created_at": data["account"]["created_at"],
    }
    assert data["profile"]["locale"] == "en"
    assert len(data["goals"]) == counts["profile_goals"]
    assert len(data["checkins"]) == counts["checkin_daily"]
    assert len(data["workouts"]) == counts["workouts_sessions"]
    assert len(data["weights"]) == counts["body_weights"]
    assert len(data["meals"]) == counts["meals_entries"]
    assert [set(p) for p in data["photos"]] == [{"id", "kind", "day", "width", "height"}]
    assert [c["provider"] for c in data["connections"]] == ["withings"]
    assert set(data["connections"][0]) == {"provider", "created_at", "last_sync_at"}
    assert not _keys(data) & EXCLUDED_KEYS


async def test_the_export_needs_a_login(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/privacy/export")).status_code == 401
