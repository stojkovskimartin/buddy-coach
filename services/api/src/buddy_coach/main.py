"""Application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from buddy_coach import __version__
from buddy_coach.coach.deps import close_coach, install_coach
from buddy_coach.coach.llm import LLMProvider
from buddy_coach.coach.router import router as coach_router
from buddy_coach.core.config import Settings, get_settings
from buddy_coach.core.db import Database
from buddy_coach.core.errors import register_error_handlers
from buddy_coach.core.events import EventBus, InProcessEventBus
from buddy_coach.core.logging import configure_logging
from buddy_coach.core.middleware import RequestContextMiddleware
from buddy_coach.health.router import router as health_router
from buddy_coach.identity.router import router as identity_router
from buddy_coach.profile.router import router as profile_router

API_PREFIX = "/api/v1"


def create_app(
    settings: Settings | None = None,
    *,
    database: Database | None = None,
    event_bus: EventBus | None = None,
    llm_provider: LLMProvider | None = None,
) -> FastAPI:
    """Build the FastAPI app. Tests pass their own settings, database, event bus and LLM."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        await close_coach(app)
        await app.state.db.dispose()

    app = FastAPI(
        title="Buddy Coach API",
        version=__version__,
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.state.settings = settings
    app.state.db = database or Database(
        settings.database_url, pool_size=settings.database_pool_size
    )
    app.state.event_bus = event_bus or InProcessEventBus()
    install_coach(app, settings, llm_provider)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(RequestContextMiddleware)
    register_error_handlers(app)

    api = APIRouter(prefix=API_PREFIX)
    api.include_router(identity_router)
    api.include_router(profile_router)
    api.include_router(coach_router)
    app.include_router(health_router)
    app.include_router(api)
    return app


def __getattr__(name: str) -> FastAPI:
    # Lazily build the ASGI app for `uvicorn buddy_coach.main:app`, so importing this module
    # (e.g. in tests) does not require production settings.
    if name == "app":
        return create_app()
    raise AttributeError(name)
