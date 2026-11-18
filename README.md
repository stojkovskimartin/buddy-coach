# Buddy Coach

A personal AI coach for athletes of every level: nutrition, training, recovery and motivation in one place.
It reads your watch, sees your meals, listens to how you feel and adjusts your plan every day.

> Working title. Product and architecture spec: see `docs/architecture.md`.

## Monorepo layout

The repository is built up PR by PR; the Status column shows what exists today.
Current status, next steps and how to run everything: **[docs/PROGRESS.md](docs/PROGRESS.md)**.

| Path | What it is | Stack | Status |
| --- | --- | --- | --- |
| `services/api` | Backend: REST API, domain modules, coach agent network | Python 3.13, FastAPI, SQLAlchemy 2 (async), Alembic | in progress |
| `apps/web` | Web app (dashboard, coach chat, logging) | React 19, TypeScript, Vite | planned |
| `apps/mobile` | iOS and Android app (HealthKit, Health Connect, camera) | Expo / React Native, TypeScript | planned |
| `apps/desktop` | Desktop app for Windows, macOS, Linux (wraps the web app) | Tauri 2 | planned |
| `packages/api-client` | Typed API client generated from the FastAPI OpenAPI spec | TypeScript | planned |
| `infra` | Local infrastructure (Postgres) and deployment files | Docker Compose | in progress |
| `docs` | Architecture, ADRs, runbooks | Markdown | done |

## Try it in 5 minutes

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) running.

```bash
git clone https://github.com/stojkovskimartin/buddy-coach.git
cd buddy-coach
docker compose -f infra/docker-compose.yml up --build
```

Then open **http://localhost:8000/docs** (interactive API page) and try, in this order:

1. `POST /api/v1/auth/register` – click *Try it out*, enter an email and a password (10+ characters).
2. `POST /api/v1/auth/login` – copy the `access_token` from the response.
3. Click **Authorize** (top right), paste the token, confirm.
4. `PUT /api/v1/profile` – your body data, e.g. `{"birth_year": 1998, "sex": "male", "height_cm": 182, "weight_kg": 79, "experience": "intermediate", "available_days_per_week": 5, "minutes_per_session": 60}`.
5. `POST /api/v1/goals` – e.g. `{"goal_type": "endurance_event", "title": "Half Ironman", "sport": "triathlon", "target_date": "2027-06-20"}`.
6. `POST /api/v1/coach/chat` – `{"message": "How many calories should I eat?"}`.

Without an API key the coach runs in **development mode**: it calls the real tools and engines
and shows their raw results. For real AI answers, create a file `infra/.env` (never committed) with:

```
BUDDY_LLM_PROVIDER=anthropic
BUDDY_ANTHROPIC_API_KEY=sk-ant-...
```

and start the same command again. This works the same on Windows, macOS and Linux.

Stop with `Ctrl+C`; `docker compose -f infra/docker-compose.yml down -v` also deletes the local data.

## Quick start (developers)

Commands below work once the corresponding path exists (see Status).

Prerequisites: Python 3.13 + [uv](https://docs.astral.sh/uv/), Node 22 + pnpm 10, Docker.

```bash
# infrastructure (Postgres + Redis)
docker compose -f infra/docker-compose.yml up -d

# backend
cd services/api
uv sync
uv run alembic upgrade head
uv run uvicorn buddy_coach.main:app --reload

# frontends (from repo root)
pnpm install
pnpm --filter @buddy/web dev
```

## Quality gates

Every change goes through a feature branch, a pull request, an independent review and green CI:

- Python: `ruff` (lint + format), `mypy --strict`, `pytest` (unit + integration)
- TypeScript: `eslint`, `tsc --noEmit`, `vitest`

See `CONTRIBUTING.md` for the workflow and `AGENTS.md` for the AI development team and its rules.
