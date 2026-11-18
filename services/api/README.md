# Buddy Coach API

FastAPI modular monolith (see `docs/adr/0002-modular-monolith.md`).

## Run locally

```bash
cp .env.example .env          # then set BUDDY_JWT_SECRET
uv sync
uv run alembic upgrade head
uv run uvicorn buddy_coach.main:app --reload
```

OpenAPI docs: http://localhost:8000/docs

## Tests

```bash
uv run pytest                                   # unit tests only if no test DB is configured
BUDDY_TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:5432/buddy_test \
  uv run pytest                                 # unit + integration
uv run ruff check . && uv run ruff format --check . && uv run mypy
```

Integration tests create the test database if it does not exist and run all Alembic migrations against it.
