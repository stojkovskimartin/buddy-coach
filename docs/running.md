# Running Buddy Coach

## 1. Just try it (Docker, any OS)

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/stojkovskimartin/buddy-coach.git   # or: git pull
cd buddy-coach
docker compose -f infra/docker-compose.yml up --build
```

| What | Where |
| --- | --- |
| Interactive API page | http://localhost:8000/docs |
| Health check | http://localhost:8000/health/ready |
| PostgreSQL (from your machine) | `localhost:5433`, user `buddy`, password `buddy`, database `buddy` |

Walkthrough: README → "Try it in 5 minutes".

**Real AI answers.** By default the coach runs in development mode (real tools and engines,
no AI sentences). Create `infra/.env` (it is git-ignored):

```
BUDDY_LLM_PROVIDER=anthropic
BUDDY_ANTHROPIC_API_KEY=sk-ant-...
```

**Stop / reset.** `Ctrl+C` stops it. `docker compose -f infra/docker-compose.yml down -v`
also deletes the local database.

## 2. Develop the backend

Needs Python 3.13 and [uv](https://docs.astral.sh/uv/getting-started/installation/).

```bash
docker compose -f infra/docker-compose.yml up -d db     # only the database
cd services/api
uv sync                                                 # creates .venv with all dependencies
cp .env.example .env                                    # Windows: copy .env.example .env
# in .env set BUDDY_DATABASE_URL=postgresql+asyncpg://buddy:buddy@localhost:5433/buddy
uv run alembic upgrade head
uv run uvicorn buddy_coach.main:app --reload            # http://localhost:8000/docs
```

PyCharm: open the repo root, set the interpreter to `services/api/.venv`, mark
`services/api/src` as Sources Root and `services/api/tests` as Test Sources Root.

## 3. Run the tests

```bash
cd services/api
uv run pytest                                     # unit + architecture tests, no database
# with the Docker database running (Windows PowerShell: $env:BUDDY_TEST_DATABASE_URL="...")
BUDDY_TEST_DATABASE_URL=postgresql+asyncpg://buddy:buddy@localhost:5433/buddy_test uv run pytest
uv run ruff check . && uv run ruff format --check . && uv run mypy
```

The test database is created and migrated automatically. Frontend tests:
`pnpm install` once at the repo root, then `pnpm test`.

## Configuration reference

All backend settings are environment variables with the prefix `BUDDY_`
(see `services/api/src/buddy_coach/core/config.py`).

| Variable | Default | Notes |
| --- | --- | --- |
| `BUDDY_ENVIRONMENT` | `development` | `production` disables `/docs` and refuses the dev LLM |
| `BUDDY_DATABASE_URL` | local Postgres | `postgresql+asyncpg://user:pass@host:port/db` |
| `BUDDY_JWT_SECRET` | – (required) | at least 32 characters |
| `BUDDY_ACCESS_TOKEN_TTL_MINUTES` | 15 | |
| `BUDDY_REFRESH_TOKEN_TTL_DAYS` | 30 | |
| `BUDDY_CORS_ORIGINS` | `["http://localhost:5173"]` | JSON list |
| `BUDDY_LLM_PROVIDER` | `dev` | `dev` or `anthropic` |
| `BUDDY_ANTHROPIC_API_KEY` | – | required for `anthropic` |
| `BUDDY_LLM_MODEL` | `claude-sonnet-5-5` | |
| `BUDDY_LOG_LEVEL` | `INFO` | logs are JSON lines |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `port is already allocated` | Another app uses 8000 or 5433: stop it, or change the left port in `infra/docker-compose.yml` |
| `/health/ready` says database down | The `db` container is still starting; wait a few seconds |
| `jwt_secret must be at least 32 characters` | Set a longer `BUDDY_JWT_SECRET` |
| Coach answers start with "(development coach)" | Expected without an API key; see "Real AI answers" |
| Integration tests are skipped | Set `BUDDY_TEST_DATABASE_URL` |
