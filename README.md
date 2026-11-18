# Buddy Coach

A personal AI coach for athletes of every level: nutrition, training, recovery and motivation in one place.
It reads your watch, sees your meals, listens to how you feel and adjusts your plan every day.

> Working title. Product and architecture spec: see `docs/architecture.md`.

## Monorepo layout

| Path | What it is | Stack |
| --- | --- | --- |
| `services/api` | Backend: REST API, domain modules, coach agent network | Python 3.13, FastAPI, SQLAlchemy 2 (async), Alembic |
| `apps/web` | Web app (dashboard, coach chat, logging) | React 19, TypeScript, Vite |
| `apps/mobile` | iOS and Android app (HealthKit, Health Connect, camera) | Expo / React Native, TypeScript |
| `apps/desktop` | Desktop app for Windows, macOS, Linux (wraps the web app) | Tauri 2 |
| `packages/api-client` | Typed API client generated from the FastAPI OpenAPI spec | TypeScript |
| `infra` | Local infrastructure (Postgres, Redis) and deployment files | Docker Compose |
| `docs` | Architecture, ADRs, runbooks | Markdown |

## Quick start

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
