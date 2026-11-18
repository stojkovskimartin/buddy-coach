"""Test fixtures.

Unit tests need nothing. Integration tests need ``BUDDY_TEST_DATABASE_URL``; the database is
created if missing, migrated from scratch once per session, and truncated after each test.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from pathlib import Path

import asyncpg
import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.engine import make_url

from buddy_coach.core.db import Database
from buddy_coach.main import create_app
from buddy_coach.models_registry import Base
from tests.support import RecordingEventBus, make_settings

API_ROOT = Path(__file__).resolve().parents[1]


def _alembic_config(url: str) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config


async def _ensure_database(url: str) -> None:
    parsed = make_url(url)
    admin = await asyncpg.connect(
        user=parsed.username,
        password=parsed.password,
        host=parsed.host,
        port=parsed.port or 5432,
        database="postgres",
    )
    try:
        exists = await admin.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", parsed.database
        )
        if not exists:
            await admin.execute(f'CREATE DATABASE "{parsed.database}"')
    finally:
        await admin.close()


@pytest.fixture(scope="session")
def database_url() -> str:
    """URL of a freshly migrated test database, or skip if none is configured."""
    url = os.environ.get("BUDDY_TEST_DATABASE_URL")
    if not url:
        pytest.skip("BUDDY_TEST_DATABASE_URL is not set")
    asyncio.run(_ensure_database(url))
    config = _alembic_config(url)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    return url


@pytest.fixture
def event_bus() -> RecordingEventBus:
    """An event bus that records published events."""
    return RecordingEventBus()


@pytest.fixture
async def app(database_url: str, event_bus: RecordingEventBus) -> AsyncIterator[FastAPI]:
    """App wired to the test database; all tables are emptied afterwards."""
    database = Database(database_url, use_null_pool=True)
    application = create_app(
        make_settings(database_url=database_url), database=database, event_bus=event_bus
    )
    yield application
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    async with database.engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} CASCADE"))
    await database.dispose()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    """HTTP client talking to the app in-process."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
