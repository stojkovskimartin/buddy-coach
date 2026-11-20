from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from cryptography.fernet import Fernet
from starlette.requests import Request

from buddy_coach.integrations.deps import get_provider_clients
from buddy_coach.integrations.domain import Provider, ProviderError
from buddy_coach.integrations.fake import FAKE_CODE, FakeClient
from buddy_coach.integrations.withings import WithingsClient
from tests.support import make_settings

REDIRECT = "http://localhost:5173/connections/callback"
NOW = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)


def test_the_consent_page_is_the_callback_page_with_code_and_state() -> None:
    url = urlsplit(FakeClient(Provider.WITHINGS, REDIRECT).authorize_url("signed state"))
    assert f"{url.scheme}://{url.netloc}{url.path}" == REDIRECT
    assert parse_qs(url.query) == {"code": [FAKE_CODE], "state": ["signed state"]}


def test_a_query_already_in_the_redirect_is_kept() -> None:
    url = FakeClient(Provider.WITHINGS, f"{REDIRECT}?app=web").authorize_url("s&t")
    assert parse_qs(urlsplit(url).query) == {"app": ["web"], "code": [FAKE_CODE], "state": ["s&t"]}


async def test_only_its_own_code_is_accepted() -> None:
    client = FakeClient(Provider.WITHINGS, REDIRECT)
    tokens = await client.exchange(FAKE_CODE, NOW)
    assert tokens.expires_at == NOW + timedelta(hours=1)
    with pytest.raises(ProviderError):
        await client.exchange("someone-elses-code", NOW)


async def test_refresh_gives_tokens_for_another_hour() -> None:
    later = NOW + timedelta(days=1)
    tokens = await FakeClient(Provider.WHOOP, REDIRECT).refresh("fake-refresh", later)
    assert tokens.expires_at == later + timedelta(hours=1)


async def test_first_sync_brings_30_days_of_weigh_ins_and_nothing_in_the_future() -> None:
    pulled = await FakeClient(Provider.WITHINGS, REDIRECT).pull("fake-access", NOW, None)
    assert len(pulled.weights) == 31  # 21 Oct to 20 Nov, today's 06:30 weigh-in included
    assert not pulled.workouts
    assert all(w.measured_at <= NOW for w in pulled.weights)
    assert all(70 < w.weight_kg < 90 for w in pulled.weights)
    assert pulled.cursor == int(NOW.timestamp())


async def test_workouts_come_every_other_day_and_never_after_now() -> None:
    early = NOW.replace(hour=8)  # today's 17:00 session has not happened yet
    pulled = await FakeClient(Provider.WHOOP, REDIRECT).pull("fake-access", early, None)
    assert len(pulled.workouts) == 15
    assert all(w.started_at <= early for w in pulled.workouts)
    assert {w.activity for w in pulled.workouts} == {"running", "cycling"}
    assert not pulled.weights


async def test_the_same_day_gives_the_same_data_so_a_resync_updates_instead_of_adding() -> None:
    client = FakeClient(Provider.WITHINGS, REDIRECT)
    first = await client.pull("fake-access", NOW, None)
    again = await client.pull("fake-access", NOW + timedelta(minutes=30), first.cursor)
    assert [w.external_id for w in again.weights] == [f"fake-{NOW.date().isoformat()}"]
    assert again.weights[0] == first.weights[-1]


async def test_real_keys_win_over_the_fake() -> None:
    settings = make_settings(
        integrations_key=Fernet.generate_key().decode(),
        fake_providers=True,
        withings_client_id="id",
        withings_client_secret="secret",
    )
    async with httpx.AsyncClient() as http:
        app = SimpleNamespace(state=SimpleNamespace(http=http))
        request = Request({"type": "http", "app": app})
        clients = get_provider_clients(request, settings)
    assert isinstance(clients[Provider.WITHINGS], WithingsClient)
    assert isinstance(clients[Provider.WHOOP], FakeClient)
