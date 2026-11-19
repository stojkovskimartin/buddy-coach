"""WHOOP API v2 client: OAuth 2 tokens and workouts.

WHOOP returns workouts newest first and rescores them for a while, so every sync reads again
from 7 days before the previous one; imports are idempotent by (source, WHOOP's workout id).
Codes, tokens and response bodies are never logged.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from pydantic import ValidationError

from buddy_coach.integrations.clients import Pulled, Tokens
from buddy_coach.integrations.domain import (
    FIRST_SYNC,
    FUTURE_TOLERANCE,
    MAX_PAGES,
    ProviderError,
    ReconnectRequiredError,
)
from buddy_coach.workouts.domain import ActivityType, WorkoutSource
from buddy_coach.workouts.schemas import ImportedWorkout

AUTHORIZE_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"  # noqa: S105  # a URL, not a secret
WORKOUTS_URL = "https://api.prod.whoop.com/developer/v2/activity/workout"
SCOPE = "offline read:workout"
"""``offline`` is what makes WHOOP issue a refresh token."""
PAGE_SIZE = 25
OVERLAP = timedelta(days=7)
KJ_PER_KCAL = 4.184

_SPORTS = {
    "running": ActivityType.RUNNING,
    "cycling": ActivityType.CYCLING,
    "mountain_biking": ActivityType.CYCLING,
    "spin": ActivityType.INDOOR_CYCLING,
    "swimming": ActivityType.SWIMMING,
    "walking": ActivityType.WALKING,
    "hiking_rucking": ActivityType.HIKING,
    "hiking": ActivityType.HIKING,
    "skiing": ActivityType.ALPINE_SKIING,
    "cross_country_skiing": ActivityType.CROSS_COUNTRY_SKIING,
    "rowing": ActivityType.ROWING,
    "weightlifting": ActivityType.STRENGTH,
    "powerlifting": ActivityType.STRENGTH,
    "functional_fitness": ActivityType.STRENGTH,
    "hiit": ActivityType.HIIT,
    "yoga": ActivityType.YOGA,
    "rock_climbing": ActivityType.CLIMBING,
    "climber": ActivityType.CLIMBING,
    "soccer": ActivityType.TEAM_SPORT,
    "basketball": ActivityType.TEAM_SPORT,
    "football": ActivityType.TEAM_SPORT,
    "ice_hockey": ActivityType.TEAM_SPORT,
    "rugby": ActivityType.TEAM_SPORT,
    "volleyball": ActivityType.TEAM_SPORT,
}


class WhoopClient:
    """One WHOOP app (client id and secret) talking through a shared HTTP client."""

    def __init__(
        self, http: httpx.AsyncClient, client_id: str, client_secret: str, redirect_url: str
    ) -> None:
        self._http = http
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_url = redirect_url

    def authorize_url(self, state: str) -> str:
        """Where the browser goes to let the athlete allow access to their workouts."""
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
        """Trade the one-time code for tokens."""
        return await self._token(
            {"grant_type": "authorization_code", "code": code, "redirect_uri": self._redirect_url},
            now,
            on_refused="The WHOOP sign-in expired or was cancelled. Connect again.",
        )

    async def refresh(self, refresh_token: str, now: datetime) -> Tokens:
        """A new token pair; the old refresh token stops working at once."""
        return await self._token(
            {"grant_type": "refresh_token", "refresh_token": refresh_token, "scope": "offline"},
            now,
            on_refused="WHOOP no longer accepts this connection. Connect it again.",
        )

    async def pull(self, access_token: str, now: datetime, cursor: int | None) -> Pulled:
        """Workouts from 7 days before the last sync (``cursor``, our clock), or the last year.

        The cursor always moves to ``now``: with newest-first pages, a sync cut off by the page
        limit has already brought in the most recent workouts.
        """
        start = (
            now - FIRST_SYNC if cursor is None else datetime.fromtimestamp(cursor, UTC) - OVERLAP
        )
        params: dict[str, Any] = {
            "start": start.isoformat().replace("+00:00", "Z"),
            "end": now.isoformat().replace("+00:00", "Z"),
            "limit": PAGE_SIZE,
        }
        workouts: list[ImportedWorkout] = []
        skipped = 0
        for _ in range(MAX_PAGES):
            page = await self._get(WORKOUTS_URL, params, access_token)
            records = page.get("records")
            if not isinstance(records, list):
                raise ProviderError("WHOOP did not answer as expected. Try again later.")
            for record in records:
                workout = workout_from_whoop(record, now) if isinstance(record, dict) else None
                if workout is None:
                    skipped += 1
                else:
                    workouts.append(workout)
            next_token = page.get("next_token")
            if not next_token:
                break
            params["nextToken"] = next_token
        return Pulled(cursor=int(now.timestamp()), skipped=skipped, workouts=workouts)

    async def _token(self, params: dict[str, str], now: datetime, *, on_refused: str) -> Tokens:
        data = {"client_id": self._client_id, "client_secret": self._client_secret, **params}
        try:
            response = await self._http.post(TOKEN_URL, data=data)
        except httpx.HTTPError as exc:
            raise ProviderError("WHOOP did not answer. Try again later.") from exc
        if response.status_code in (400, 401):  # invalid_grant: used, expired or revoked
            raise ReconnectRequiredError(on_refused)
        body = _json(response)
        try:
            return Tokens(
                access_token=str(body["access_token"]),
                refresh_token=str(body["refresh_token"]),
                expires_at=now + timedelta(seconds=int(body["expires_in"])),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ProviderError("WHOOP did not answer as expected. Try again later.") from exc

    async def _get(self, url: str, params: dict[str, Any], access_token: str) -> dict[str, Any]:
        try:
            response = await self._http.get(
                url, params=params, headers={"Authorization": f"Bearer {access_token}"}
            )
        except httpx.HTTPError as exc:
            raise ProviderError("WHOOP did not answer. Try again later.") from exc
        if response.status_code in (httpx.codes.UNAUTHORIZED, httpx.codes.FORBIDDEN):
            raise ReconnectRequiredError("WHOOP no longer accepts this connection.")
        return _json(response)


def _json(response: httpx.Response) -> dict[str, Any]:
    if response.status_code != httpx.codes.OK:  # 429 too many requests, 5xx
        raise ProviderError("WHOOP could not answer right now. Try again later.")
    try:
        body = response.json()
    except ValueError as exc:
        raise ProviderError("WHOOP did not answer as expected. Try again later.") from exc
    if not isinstance(body, dict):
        raise ProviderError("WHOOP did not answer as expected. Try again later.")
    return body


def workout_from_whoop(record: dict[str, Any], now: datetime) -> ImportedWorkout | None:
    """A WHOOP workout as an import, or None when it cannot be used (no valid times, longer
    than a day, or starting in the future). Measurements outside plausible ranges are left out
    instead of failing the sync; unscored workouts come without them."""
    try:
        start = datetime.fromisoformat(str(record["start"]))
        end = datetime.fromisoformat(str(record["end"]))
    except (KeyError, ValueError):
        return None
    workout_id = record.get("id")
    if not workout_id or start.tzinfo is None or end.tzinfo is None:
        return None
    minutes = round((end - start).total_seconds() / 60, 1)
    if not 0 < minutes <= 24 * 60 or start > now + FUTURE_TOLERANCE:
        return None
    score = record.get("score") if record.get("score_state") == "SCORED" else None
    score = score if isinstance(score, dict) else {}
    avg_hr = _within(score.get("average_heart_rate"), 30, 230)
    max_hr = _within(score.get("max_heart_rate"), 30, 240)
    if avg_hr is not None and max_hr is not None and max_hr < avg_hr:
        max_hr = None
    sport = str(record.get("sport_name") or "").lower().replace("-", "_").replace(" ", "_")
    distance_m = _within(score.get("distance_meter"), 0, 1_000_000)
    kilojoule = _within(score.get("kilojoule"), 0, 20_000 * KJ_PER_KCAL)
    try:
        return ImportedWorkout(
            source=WorkoutSource.WHOOP,
            external_id=str(workout_id)[:128],
            activity=_SPORTS.get(sport, ActivityType.OTHER),
            started_at=start,
            duration_min=minutes,
            distance_km=round(distance_m / 1000, 3) if distance_m else None,
            elevation_gain_m=_within(score.get("altitude_gain_meter"), 0, 10_000),
            avg_hr=avg_hr,
            max_hr=max_hr,
            kcal=round(kilojoule / KJ_PER_KCAL) if kilojoule else None,
        )
    except ValidationError:  # anything else implausible: leave the record out, never the sync
        return None


def _within(value: Any, low: float, high: float) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value) if low <= value <= high else None
