from __future__ import annotations

import httpx
import pytest

from buddy_coach.identity.events import UserRegistered
from tests.support import DEFAULT_PASSWORD, RecordingEventBus, register_and_login

pytestmark = pytest.mark.integration


async def _login(client: httpx.AsyncClient, email: str = "athlete@example.com") -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    assert response.status_code == 200, response.text
    tokens: dict[str, str] = response.json()
    return tokens


async def test_register_returns_user_and_publishes_event(
    client: httpx.AsyncClient, event_bus: RecordingEventBus
) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "  New.Athlete@Example.com ", "password": DEFAULT_PASSWORD},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new.athlete@example.com"
    assert "password" not in response.text
    assert any(isinstance(e, UserRegistered) for e in event_bus.published)


async def test_duplicate_email_is_rejected_case_insensitively(client: httpx.AsyncClient) -> None:
    await register_and_login(client, "dup@example.com")
    response = await client.post(
        "/api/v1/auth/register", json={"email": "DUP@example.com", "password": DEFAULT_PASSWORD}
    )
    assert response.status_code == 409


async def test_short_password_is_rejected(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/register", json={"email": "a@example.com", "password": "short"}
    )
    assert response.status_code == 422


async def test_login_errors_do_not_reveal_whether_email_exists(client: httpx.AsyncClient) -> None:
    await register_and_login(client)
    wrong_password = await client.post(
        "/api/v1/auth/login", json={"email": "athlete@example.com", "password": "wrong-password"}
    )
    unknown_user = await client.post(
        "/api/v1/auth/login", json={"email": "ghost@example.com", "password": "wrong-password"}
    )
    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json()["detail"] == unknown_user.json()["detail"]


async def test_me_returns_current_user(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    response = await client.get("/api/v1/users/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["email"] == "athlete@example.com"


async def test_me_rejects_garbage_token(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/users/me", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401


async def test_refresh_token_cannot_be_used_as_access_token(client: httpx.AsyncClient) -> None:
    await register_and_login(client)
    tokens = await _login(client)
    response = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}
    )
    assert response.status_code == 401


async def test_refresh_rotates_and_detects_reuse(client: httpx.AsyncClient) -> None:
    await register_and_login(client)
    first = await _login(client)

    rotated = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}
    )
    assert rotated.status_code == 200
    second = rotated.json()
    assert second["refresh_token"] != first["refresh_token"]

    # Reusing the old token is treated as theft: rejected, and the whole family is revoked.
    reuse = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}
    )
    assert reuse.status_code == 401
    after_reuse = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": second["refresh_token"]}
    )
    assert after_reuse.status_code == 401


async def test_logout_revokes_refresh_token(client: httpx.AsyncClient) -> None:
    await register_and_login(client)
    tokens = await _login(client)
    logout = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]}
    )
    assert logout.status_code == 204
    refresh = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refresh.status_code == 401


async def test_logout_with_invalid_token_is_a_no_op(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/auth/logout", json={"refresh_token": "garbage"})
    assert response.status_code == 204
