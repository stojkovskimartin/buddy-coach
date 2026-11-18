"""The default dev provider runs the full stack without an API key."""

from __future__ import annotations

import httpx
import pytest

from tests.support import VALID_PROFILE, register_and_login

pytestmark = pytest.mark.integration


async def test_dev_coach_answers_with_tool_data(client: httpx.AsyncClient) -> None:
    headers = await register_and_login(client)
    await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    response = await client.post(
        "/api/v1/coach/chat", json={"message": "hello coach"}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["agent"] == "head_coach"
    assert body["degraded"] is False
    assert "development coach" in body["reply"]
