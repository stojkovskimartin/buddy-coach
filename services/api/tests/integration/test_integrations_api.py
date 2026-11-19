"""Direct Withings connection against a fake Withings, with a clock that can move."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI
from pydantic import SecretStr
from sqlalchemy import text

from buddy_coach.core.deps import get_clock
from buddy_coach.integrations.deps import get_withings_client
from buddy_coach.integrations.withings import MEASURE_URL, TOKEN_URL, WithingsClient
from tests.support import VALID_PROFILE, make_settings, register_and_login

pytestmark = pytest.mark.integration

URL = "/api/v1/integrations"
REDIRECT = "http://localhost:5173/connections/callback"
START = datetime(2026, 11, 18, 23, 30, tzinfo=UTC)


def _group(grpid: int, at: datetime, kg_grams: int, attrib: int = 0) -> dict[str, Any]:
    return {
        "grpid": grpid,
        "attrib": attrib,
        "date": int(at.timestamp()),
        "category": 1,
        "measures": [
            {"type": 1, "value": kg_grams, "unit": -3},
            {"type": 6, "value": 1820, "unit": -2},
        ],
    }


@dataclass
class FakeWithings:
    """Answers like Withings and records what it was asked."""

    groups: list[dict[str, Any]] = field(default_factory=list)
    update_time: int = 1_800_000_000
    refresh_ok: bool = True
    token_status: int = 0  # a passing error on the token endpoint
    measure_status: int = 0
    page_size: int = 0  # > 0: answer in pages of this many groups
    issued: int = 0
    calls: list[dict[str, str]] = field(default_factory=list)

    def handler(self, request: httpx.Request) -> httpx.Response:
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        url = str(request.url)
        self.calls.append({"url": url, **form})
        if url == TOKEN_URL:
            if self.token_status:
                return httpx.Response(200, json={"status": self.token_status})
            if form["grant_type"] == "refresh_token" and (
                not self.refresh_ok or form["refresh_token"] != f"refresh-{self.issued}"
            ):
                return httpx.Response(200, json={"status": 503, "error": "invalid refresh"})
            self.issued += 1
            body = {
                "userid": "42",
                "access_token": f"access-{self.issued}",
                "refresh_token": f"refresh-{self.issued}",
                "expires_in": 10800,
                "scope": "user.metrics",
                "token_type": "Bearer",
            }
            return httpx.Response(200, json={"status": 0, "body": body})
        assert url == MEASURE_URL
        assert request.headers["Authorization"] == f"Bearer access-{self.issued}"
        if self.measure_status:
            return httpx.Response(200, json={"status": self.measure_status})
        offset = int(form.get("offset", 0))
        size = self.page_size or len(self.groups) or 1
        groups = self.groups[offset : offset + size]
        more = offset + size < len(self.groups)
        body = {
            "updatetime": self.update_time,
            "timezone": "Europe/Zurich",
            "measuregrps": groups,
            "more": int(more),
            "offset": offset + size if more else 0,
        }
        return httpx.Response(200, json={"status": 0, "body": body})


@dataclass
class Clock:
    now: datetime = START

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def fake() -> FakeWithings:
    return FakeWithings()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture(autouse=True)
async def withings_app(app: FastAPI, fake: FakeWithings, clock: Clock) -> AsyncIterator[None]:
    settings = app.state.settings
    app.state.settings = make_settings(
        database_url=settings.database_url,
        integrations_key=Fernet.generate_key().decode(),
        withings_client_id="client-id",
        withings_client_secret="client-secret",
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)) as http:
        withings = WithingsClient(http, "client-id", "client-secret", REDIRECT)
        app.dependency_overrides[get_withings_client] = lambda: withings
        app.dependency_overrides[get_clock] = lambda: clock
        yield
    app.dependency_overrides.clear()


async def _athlete(client: httpx.AsyncClient, email: str = "athlete@example.com") -> dict[str, str]:
    headers = await register_and_login(client, email)
    assert (
        await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    ).status_code == 200
    return headers


async def _state(client: httpx.AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post(f"{URL}/withings/connect", headers=headers)
    assert response.status_code == 200
    url = urlsplit(response.json()["authorize_url"])
    query = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert (
        f"{url.scheme}://{url.netloc}{url.path}"
        == "https://account.withings.com/oauth2_user/authorize2"
    )
    assert query["client_id"] == "client-id"
    assert query["scope"] == "user.metrics"
    assert query["redirect_uri"] == REDIRECT
    return query["state"]


async def _connect(client: httpx.AsyncClient, headers: dict[str, str]) -> httpx.Response:
    state = await _state(client, headers)
    return await client.post(
        f"{URL}/withings/callback", json={"code": "the-code", "state": state}, headers=headers
    )


async def test_connecting_imports_the_last_year_and_keeps_tokens_encrypted(
    client: httpx.AsyncClient, fake: FakeWithings, app: FastAPI
) -> None:
    fake.groups = [
        _group(1, START - timedelta(days=2), 78_400),
        _group(2, START - timedelta(hours=3), 78_100),
        _group(3, START - timedelta(hours=2), 54_000, attrib=1),  # a guest on the scale
        _group(4, START + timedelta(days=2), 77_000),  # wrong scale clock
    ]
    headers = await _athlete(client)

    response = await _connect(client, headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["synced"], body["created"], body["updated"], body["skipped"]) == (True, 2, 0, 0)
    first_sync = fake.calls[-1]
    assert first_sync["action"] == "getmeas"
    assert first_sync["meastype"] == "1"
    assert first_sync["category"] == "1"
    assert int(first_sync["startdate"]) == int((START - timedelta(days=365)).timestamp())
    assert "lastupdate" not in first_sync
    exchange = fake.calls[0]
    assert (exchange["grant_type"], exchange["code"], exchange["redirect_uri"]) == (
        "authorization_code",
        "the-code",
        REDIRECT,
    )
    weights = (await client.get("/api/v1/body/weights", headers=headers)).json()["weights"]
    assert [(w["source"], w["weight_kg"]) for w in weights] == [
        ("withings", 78.1),
        ("withings", 78.4),
    ]  # newest first
    profile = (await client.get("/api/v1/profile", headers=headers)).json()
    assert profile["weight_kg"] == 78.1
    providers = (await client.get(URL, headers=headers)).json()
    assert providers == [
        {
            "provider": "withings",
            "available": True,
            "connected": True,
            "last_sync_at": "2026-11-18T23:30:00Z",
        }
    ]
    async with app.state.db.engine.connect() as conn:
        stored = (
            await conn.execute(
                text("SELECT access_token, refresh_token FROM integrations_connections")
            )
        ).one()
    assert "access-1" not in stored[0]
    assert "refresh-1" not in stored[1]


async def test_a_state_from_another_user_or_too_old_is_refused(
    client: httpx.AsyncClient, clock: Clock, fake: FakeWithings
) -> None:
    alice = await _athlete(client, "alice@example.com")
    mallory = await _athlete(client, "mallory@example.com")
    state = await _state(client, mallory)

    stolen = await client.post(
        f"{URL}/withings/callback", json={"code": "c", "state": state}, headers=alice
    )
    clock.now += timedelta(minutes=11)
    late = await client.post(
        f"{URL}/withings/callback", json={"code": "c", "state": state}, headers=mallory
    )
    forged = await client.post(
        f"{URL}/withings/callback", json={"code": "c", "state": "not-a-state"}, headers=mallory
    )

    assert [r.status_code for r in (stolen, late, forged)] == [422, 422, 422]
    assert fake.calls == []  # no code was ever exchanged
    assert (await client.get(URL, headers=alice)).json()[0]["connected"] is False


async def test_sync_waits_ten_minutes_then_continues_from_the_cursor_with_a_fresh_token(
    client: httpx.AsyncClient, fake: FakeWithings, clock: Clock
) -> None:
    headers = await _athlete(client)
    assert (await _connect(client, headers)).status_code == 200

    clock.now += timedelta(minutes=5)
    early = (await client.post(f"{URL}/withings/sync", headers=headers)).json()
    assert early == {
        "synced": False,
        "last_sync_at": "2026-11-18T23:30:00Z",
        "created": 0,
        "updated": 0,
        "skipped": 0,
    }

    clock.now += timedelta(hours=3)  # the access token has expired
    fake.groups = [_group(7, clock.now - timedelta(minutes=30), 77_900)]
    response = await client.post(f"{URL}/withings/sync", headers=headers)

    assert response.status_code == 200
    assert response.json()["created"] == 1
    refresh, measure = fake.calls[-2:]
    assert (refresh["grant_type"], refresh["refresh_token"]) == ("refresh_token", "refresh-1")
    assert measure["lastupdate"] == str(fake.update_time)
    assert "startdate" not in measure
    clock.now += timedelta(hours=4)
    assert (await client.post(f"{URL}/withings/sync", headers=headers)).status_code == 200
    assert fake.calls[-2]["refresh_token"] == "refresh-2"  # the rotated token was kept


async def test_a_refused_refresh_disconnects_and_asks_to_connect_again(
    client: httpx.AsyncClient, fake: FakeWithings, clock: Clock
) -> None:
    headers = await _athlete(client)
    assert (await _connect(client, headers)).status_code == 200
    fake.refresh_ok = False
    clock.now += timedelta(hours=4)

    response = await client.post(f"{URL}/withings/sync", headers=headers)

    assert response.status_code == 409
    assert response.json()["code"] == "reconnect_required"
    assert (await client.get(URL, headers=headers)).json()[0]["connected"] is False
    weights = (await client.get("/api/v1/body/weights", headers=headers)).json()["weights"]
    assert weights == []


async def test_a_provider_failure_is_a_502_and_does_not_block_the_next_sync(
    client: httpx.AsyncClient, fake: FakeWithings, clock: Clock
) -> None:
    headers = await _athlete(client)
    assert (await _connect(client, headers)).status_code == 200
    clock.now += timedelta(minutes=20)
    fake.measure_status = 601  # rate limited

    failed = await client.post(f"{URL}/withings/sync", headers=headers)
    fake.measure_status = 0
    retried = await client.post(f"{URL}/withings/sync", headers=headers)

    assert failed.status_code == 502
    assert failed.json()["code"] == "provider_error"
    assert retried.json()["synced"] is True


async def test_disconnect_keeps_the_weights(client: httpx.AsyncClient, fake: FakeWithings) -> None:
    fake.groups = [_group(1, START - timedelta(days=1), 78_000)]
    headers = await _athlete(client)
    assert (await _connect(client, headers)).status_code == 200

    assert (await client.delete(f"{URL}/withings", headers=headers)).status_code == 204
    assert (await client.delete(f"{URL}/withings", headers=headers)).status_code == 404
    assert (await client.post(f"{URL}/withings/sync", headers=headers)).status_code == 404
    weights = (await client.get("/api/v1/body/weights", headers=headers)).json()["weights"]
    assert len(weights) == 1


async def test_without_setup_the_provider_is_listed_but_not_offered(
    client: httpx.AsyncClient, app: FastAPI
) -> None:
    app.dependency_overrides[get_withings_client] = lambda: None
    headers = await _athlete(client)

    providers = (await client.get(URL, headers=headers)).json()
    connect = await client.post(f"{URL}/withings/connect", headers=headers)

    assert providers[0]["available"] is False
    assert connect.status_code == 422


async def test_phones_cannot_import_weights_as_withings(client: httpx.AsyncClient) -> None:
    headers = await _athlete(client)
    weight = {
        "source": "withings",
        "external_id": "1",
        "measured_at": "2026-11-18T07:00:00Z",
        "weight_kg": 70,
    }

    response = await client.post(
        "/api/v1/body/weights/import", json={"weights": [weight]}, headers=headers
    )

    assert response.status_code == 422


async def test_a_passing_error_while_refreshing_keeps_the_account(
    client: httpx.AsyncClient, fake: FakeWithings, clock: Clock
) -> None:
    headers = await _athlete(client)
    assert (await _connect(client, headers)).status_code == 200
    clock.now += timedelta(hours=4)
    fake.token_status = 601  # too many requests

    response = await client.post(f"{URL}/withings/sync", headers=headers)

    assert response.status_code == 502
    assert (await client.get(URL, headers=headers)).json()[0]["connected"] is True


async def test_a_refused_token_during_the_sync_disconnects(
    client: httpx.AsyncClient, fake: FakeWithings, clock: Clock
) -> None:
    headers = await _athlete(client)
    assert (await _connect(client, headers)).status_code == 200
    clock.now += timedelta(minutes=20)
    fake.measure_status = 401

    response = await client.post(f"{URL}/withings/sync", headers=headers)

    assert response.json()["code"] == "reconnect_required"
    assert (await client.get(URL, headers=headers)).json()[0]["connected"] is False


async def test_a_new_encryption_key_asks_to_connect_again(
    client: httpx.AsyncClient, app: FastAPI, clock: Clock
) -> None:
    headers = await _athlete(client)
    assert (await _connect(client, headers)).status_code == 200
    app.state.settings = app.state.settings.model_copy(
        update={"integrations_key": SecretStr(Fernet.generate_key().decode())}
    )
    clock.now += timedelta(minutes=20)

    response = await client.post(f"{URL}/withings/sync", headers=headers)

    assert response.json()["code"] == "reconnect_required"
    assert (await client.get(URL, headers=headers)).json()[0]["connected"] is False


async def test_every_page_is_imported(client: httpx.AsyncClient, fake: FakeWithings) -> None:
    fake.groups = [_group(i, START - timedelta(days=i), 78_000 + i * 10) for i in range(1, 6)]
    fake.page_size = 2
    headers = await _athlete(client)

    body = (await _connect(client, headers)).json()

    assert body["created"] == 5
    assert [c.get("offset") for c in fake.calls if c["url"] == MEASURE_URL] == [None, "2", "4"]


async def test_a_failed_code_exchange_connects_nothing(
    client: httpx.AsyncClient, fake: FakeWithings
) -> None:
    fake.token_status = 503  # the code was used or expired
    headers = await _athlete(client)

    response = await _connect(client, headers)

    assert response.json()["code"] == "reconnect_required"
    assert (await client.get(URL, headers=headers)).json()[0]["connected"] is False


async def test_a_failed_first_sync_still_connects(
    client: httpx.AsyncClient, fake: FakeWithings
) -> None:
    fake.measure_status = 601
    headers = await _athlete(client)

    response = await _connect(client, headers)

    assert response.status_code == 200
    assert response.json()["synced"] is False
    fake.measure_status = 0
    assert (await client.post(f"{URL}/withings/sync", headers=headers)).json()["synced"] is True


async def test_every_endpoint_needs_a_login(client: httpx.AsyncClient) -> None:
    responses = [
        await client.get(URL),
        await client.post(f"{URL}/withings/connect"),
        await client.post(f"{URL}/withings/callback", json={"code": "c", "state": "s"}),
        await client.post(f"{URL}/withings/sync"),
        await client.delete(f"{URL}/withings"),
    ]
    assert [r.status_code for r in responses] == [401] * 5
