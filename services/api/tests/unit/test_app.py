"""App-level behaviour that needs no database: errors, middleware, health."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

from buddy_coach.core.db import Database
from buddy_coach.core.errors import ConflictError, NotFoundError
from buddy_coach.main import create_app
from tests.support import UNREACHABLE_DB_URL, make_settings, production_settings


class Payload(BaseModel):
    count: int


def _test_routes() -> APIRouter:
    router = APIRouter(prefix="/_test")

    @router.get("/not-found")
    async def not_found() -> None:
        raise NotFoundError("Nothing here.")

    @router.get("/conflict")
    async def conflict() -> None:
        raise ConflictError("Already exists.")

    @router.get("/crash")
    async def crash() -> None:
        raise RuntimeError("secret internal detail")

    @router.post("/validate")
    async def validate(body: Payload) -> Payload:
        return body

    return router


@pytest.fixture
async def unit_client() -> AsyncIterator[httpx.AsyncClient]:
    app: FastAPI = create_app(
        make_settings(), database=Database(UNREACHABLE_DB_URL, use_null_pool=True)
    )
    app.include_router(_test_routes())
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_domain_error_is_problem_json(unit_client: httpx.AsyncClient) -> None:
    response = await unit_client.get("/_test/not-found")
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    body = response.json()
    assert body["code"] == "not_found"
    assert body["detail"] == "Nothing here."
    assert body["status"] == 404


async def test_conflict_maps_to_409(unit_client: httpx.AsyncClient) -> None:
    response = await unit_client.get("/_test/conflict")
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


async def test_unhandled_error_does_not_leak_details(unit_client: httpx.AsyncClient) -> None:
    response = await unit_client.get("/_test/crash")
    assert response.status_code == 500
    assert "secret internal detail" not in response.text
    assert response.json()["code"] == "internal_error"


async def test_validation_error_lists_fields(unit_client: httpx.AsyncClient) -> None:
    response = await unit_client.post("/_test/validate", json={"count": "many"})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "invalid_request"
    assert body["errors"][0]["loc"] == ["body", "count"]


async def test_request_id_is_echoed_and_security_headers_set(
    unit_client: httpx.AsyncClient,
) -> None:
    response = await unit_client.get("/health/live", headers={"X-Request-ID": "abc-123"})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "abc-123"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


async def test_unsafe_request_id_is_replaced(unit_client: httpx.AsyncClient) -> None:
    response = await unit_client.get("/health/live", headers={"X-Request-ID": "bad id\n<script>"})
    assert response.headers["X-Request-ID"] != "bad id\n<script>"
    assert len(response.headers["X-Request-ID"]) == 32


async def test_readiness_reports_database_down(unit_client: httpx.AsyncClient) -> None:
    response = await unit_client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["database"] == "down"


async def test_protected_route_without_token_is_401(unit_client: httpx.AsyncClient) -> None:
    response = await unit_client.get("/api/v1/profile")
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_docs_are_disabled_in_production() -> None:
    app = create_app(
        production_settings(),
        database=Database(UNREACHABLE_DB_URL, use_null_pool=True),
    )
    assert app.openapi_url is None
    assert app.docs_url is None
