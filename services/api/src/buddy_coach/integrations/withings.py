"""Withings Public API client: OAuth 2 tokens and weight measurements.

Withings answers HTTP 200 with a ``status`` field; anything but 0 is an error. Codes, tokens and
response bodies are never logged.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx

from buddy_coach.integrations.domain import (
    WITHINGS_WEIGHT,
    MeasurePage,
    ProviderError,
    ReconnectRequiredError,
    parse_withings_measures,
)

AUTHORIZE_URL = "https://account.withings.com/oauth2_user/authorize2"
TOKEN_URL = "https://wbsapi.withings.net/v2/oauth2"  # noqa: S105  # a URL, not a secret
MEASURE_URL = "https://wbsapi.withings.net/measure"
SCOPE = "user.metrics"
REAL_MEASURES = 1
"""``category`` 1: real measurements (2 would be the user's goals)."""
REFUSED = frozenset({100, 101, 102, 200, 343, 401})
"""Statuses meaning Withings no longer accepts the token; any other error is passing."""
REFUSED_GRANT = REFUSED | {304, 503}
"""On the token endpoint also a bad or used code and an invalid refresh token."""


@dataclass(frozen=True, slots=True)
class Tokens:
    """A fresh token pair. Withings rotates the refresh token on every refresh."""

    access_token: str
    refresh_token: str
    expires_at: datetime


class WithingsClient:
    """One Withings app (client id and secret) talking through a shared HTTP client."""

    def __init__(
        self, http: httpx.AsyncClient, client_id: str, client_secret: str, redirect_url: str
    ) -> None:
        self._http = http
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_url = redirect_url

    def authorize_url(self, state: str) -> str:
        """Where the browser goes to let the athlete allow access to their weights."""
        query = urlencode(
            {
                "response_type": "code",
                "client_id": self._client_id,
                "scope": SCOPE,
                "redirect_uri": self._redirect_url,
                "state": state,
            }
        )
        return f"{AUTHORIZE_URL}?{query}"

    async def exchange(self, code: str, now: datetime) -> Tokens:
        """Trade the one-time code (valid 30 seconds) for tokens."""
        body = await self._token_call(
            {"grant_type": "authorization_code", "code": code, "redirect_uri": self._redirect_url},
            on_error="The Withings sign-in expired or was cancelled. Connect again.",
        )
        return _tokens(body, now)

    async def refresh(self, refresh_token: str, now: datetime) -> Tokens:
        """A new token pair; the old refresh token stops working soon after."""
        body = await self._token_call(
            {"grant_type": "refresh_token", "refresh_token": refresh_token},
            on_error="Withings no longer accepts this connection. Connect it again.",
        )
        return _tokens(body, now)

    async def weights(
        self, access_token: str, now: datetime, *, since: int | None, start: datetime, offset: int
    ) -> MeasurePage:
        """One page of weigh-ins: changed since the ``since`` cursor, or measured after
        ``start`` on the first sync."""
        params: dict[str, Any] = {
            "action": "getmeas",
            "meastype": WITHINGS_WEIGHT,
            "category": REAL_MEASURES,
        }
        if since is None:
            params |= {"startdate": int(start.timestamp()), "enddate": int(now.timestamp())}
        else:
            params["lastupdate"] = since
        if offset:
            params["offset"] = offset
        payload = await self._post(
            MEASURE_URL, params, headers={"Authorization": f"Bearer {access_token}"}
        )
        status = payload.get("status")
        if status in REFUSED:
            raise ReconnectRequiredError("Withings no longer accepts this connection.")
        if status != 0:
            raise ProviderError("Withings could not return the weights. Try again later.")
        try:
            return parse_withings_measures(_body(payload), now)
        except (KeyError, TypeError, ValueError) as exc:
            raise ProviderError("Withings did not answer as expected. Try again later.") from exc

    async def _token_call(self, params: dict[str, str], *, on_error: str) -> dict[str, Any]:
        payload = await self._post(
            TOKEN_URL,
            {
                "action": "requesttoken",
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                **params,
            },
        )
        status = payload.get("status")
        if status in REFUSED_GRANT:
            raise ReconnectRequiredError(on_error)
        if status != 0:
            raise ProviderError("Withings could not sign in right now. Try again later.")
        return _body(payload)

    async def _post(
        self, url: str, data: dict[str, Any], headers: dict[str, str] | None = None
    ) -> dict[str, Any]:
        try:
            response = await self._http.post(url, data=data, headers=headers)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderError("Withings did not answer. Try again later.") from exc
        if not isinstance(payload, dict):
            raise ProviderError("Withings did not answer as expected. Try again later.")
        return payload


def _body(payload: dict[str, Any]) -> dict[str, Any]:
    body = payload.get("body")
    if not isinstance(body, dict):
        raise ProviderError("Withings did not answer as expected. Try again later.")
    return body


def _tokens(body: dict[str, Any], now: datetime) -> Tokens:
    try:
        return Tokens(
            access_token=str(body["access_token"]),
            refresh_token=str(body["refresh_token"]),
            expires_at=now + timedelta(seconds=int(body["expires_in"])),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ProviderError("Withings did not answer as expected. Try again later.") from exc
