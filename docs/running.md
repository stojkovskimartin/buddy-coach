# Running Buddy Coach

## 1. Just try it (Docker, any OS)

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Docker Compose 2.24 or newer).

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
no AI sentences). Put the settings of one option below in `infra/.env` for Docker, or in
`services/api/.env` for section 2 (both are git-ignored), then restart the API.

**Stop / reset.** `Ctrl+C` stops it. `docker compose -f infra/docker-compose.yml down -v`
also deletes the local database.

## 2. Develop the backend

Needs Python 3.13 and [uv](https://docs.astral.sh/uv/getting-started/installation/).

Works the same in PowerShell, bash and zsh (one command per line):

```bash
docker compose -f infra/docker-compose.yml up -d db
cd services/api
uv sync
cp .env.example .env
uv run --env-file .env alembic upgrade head
uv run --env-file .env uvicorn buddy_coach.main:app --reload
```

`uv sync` creates `.venv` with all dependencies. `.env.example` already points at the Docker
database on `localhost:5433`; set your own `BUDDY_JWT_SECRET` in `.env`. `--env-file` is needed
because neither uv nor Alembic reads `.env` by itself. The API runs on http://localhost:8000/docs.

PyCharm: open the repo root, set the interpreter to `services/api/.venv`, mark
`services/api/src` as Sources Root and `services/api/tests` as Test Sources Root.

## Real AI answers

| Option | Cost | Your data |
| --- | --- | --- |
| Ollama or LM Studio on your computer | free | stays on your computer |
| Groq, Google Gemini or OpenRouter free tier | free, with rate limits | sent to the provider; free tiers may use it, check their terms |
| Anthropic | paid per use | sent to Anthropic |

**Free and local: Ollama.** Install it from https://ollama.com, then download a model that can
call tools (about 5 GB):

```bash
ollama pull qwen3:8b
```

```
BUDDY_LLM_PROVIDER=openai_compatible
BUDDY_LLM_BASE_URL=http://localhost:11434/v1
BUDDY_LLM_MODEL=qwen3:8b
```

When the API runs in Docker, use `http://host.docker.internal:11434/v1` as the URL; on Linux,
also start Ollama with `OLLAMA_HOST=0.0.0.0` so the container can reach it. On a computer with
less memory, `qwen3:4b` is smaller and faster but gives weaker answers.
LM Studio works the same way with `http://localhost:1234/v1` and the model name it shows.

**Free in the cloud.** Create a key in the provider's console and set:

| Provider | `BUDDY_LLM_BASE_URL` | `BUDDY_LLM_MODEL` (example) |
| --- | --- | --- |
| Groq (console.groq.com) | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Google Gemini (aistudio.google.com) | `https://generativelanguage.googleapis.com/v1beta/openai` | a Gemini Flash model from its model list |
| OpenRouter (openrouter.ai) | `https://openrouter.ai/api/v1` | a model whose name ends in `:free` |

```
BUDDY_LLM_PROVIDER=openai_compatible
BUDDY_LLM_BASE_URL=https://api.groq.com/openai/v1
BUDDY_LLM_MODEL=llama-3.3-70b-versatile
BUDDY_LLM_API_KEY=your-key
```

**Paid: Anthropic.**

```
BUDDY_LLM_PROVIDER=anthropic
BUDDY_ANTHROPIC_API_KEY=sk-ant-...
```

Small local models follow the coach's rules less reliably than large hosted ones; the safety
checks and the tools behave the same with every provider.

## Update after `git pull`

New code often brings new libraries and database tables, and a running API keeps the old code
until it is restarted. After every pull:

```bash
cd services/api
uv sync
uv run --env-file .env alembic upgrade head
uv run --env-file .env uvicorn buddy_coach.main:app --reload
```

and, for the web app, `pnpm install` in the repo root. With Docker:
`docker compose -f infra/docker-compose.yml up --build` (the `--build` matters).

If the app says "This needs a newer server", the API that runs is older than the app: do the
steps above.

## 3. Run the tests

Unit and architecture tests need no database:

```bash
cd services/api
uv run pytest
```

All tests, with the Docker database running. PowerShell:

```powershell
$env:BUDDY_TEST_DATABASE_URL = "postgresql+asyncpg://buddy:buddy@localhost:5433/buddy_test"
uv run pytest
```

bash / zsh:

```bash
BUDDY_TEST_DATABASE_URL=postgresql+asyncpg://buddy:buddy@localhost:5433/buddy_test uv run pytest
```

Code quality (one per line):

```bash
uv run ruff check .
uv run ruff format --check .
uv run mypy
```

The test database is created and migrated automatically.

Frontend: `pnpm install` once at the repo root (Node 22 + pnpm), then `pnpm test` for all
frontend tests (API client, web, mobile).

## 4. Web and mobile apps

- **Web:** `pnpm --filter @buddy/web dev`, then open http://localhost:5173 (with the API running).
- **Mobile (iOS and Android), with the API running:** install Expo Go on your phone,
  `cp apps/mobile/.env.example apps/mobile/.env` and set `EXPO_PUBLIC_API_BASE_URL` there to
  your computer's Wi-Fi address (e.g. `http://192.168.1.20:8000`), then run
  `pnpm --filter @buddy/mobile start` and scan the QR code. Details: [apps/mobile/README.md](../apps/mobile/README.md).

## Configuration reference

All backend settings are environment variables with the prefix `BUDDY_`
(see `services/api/src/buddy_coach/core/config.py`).

| Variable | Default | Notes |
| --- | --- | --- |
| `BUDDY_ENVIRONMENT` | `development` | `production` disables `/docs` and `/openapi.json` and refuses the dev LLM |
| `BUDDY_DATABASE_URL` | `postgresql+asyncpg://buddy:buddy@localhost:5432/buddy` | the Docker database is on port 5433 (set in `.env.example`) |
| `BUDDY_JWT_SECRET` | – (required) | at least 32 characters |
| `BUDDY_ACCESS_TOKEN_TTL_MINUTES` | 15 | |
| `BUDDY_REFRESH_TOKEN_TTL_DAYS` | 30 | |
| `BUDDY_CORS_ORIGINS` | `["http://localhost:5173"]` | JSON list |
| `BUDDY_LLM_PROVIDER` | `dev` | `dev`, `anthropic` or `openai_compatible` (see "Real AI answers") |
| `BUDDY_ANTHROPIC_API_KEY` | – | required for `anthropic` |
| `BUDDY_LLM_MODEL` | `claude-sonnet-5-5` | required for `openai_compatible` |
| `BUDDY_LLM_BASE_URL` | – | required for `openai_compatible`, e.g. `http://localhost:11434/v1` |
| `BUDDY_LLM_API_KEY` | – | for `openai_compatible` providers that need a key |
| `BUDDY_MEDIA_DIR` | `./media` | where photos are stored, relative to the API's folder (Docker: the `media` volume at `/app/media`) |
| `BUDDY_MEAL_PHOTO_RETENTION_DAYS` | 90 | meal photos older than this are removed; food entries stay |
| `BUDDY_LOG_LEVEL` | `INFO` | logs are JSON lines |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `port is already allocated` | Another app uses 8000 or 5433: stop it, or change the left port in `infra/docker-compose.yml` |
| `/health/ready` says database down | The `db` container is still starting; wait a few seconds |
| `jwt_secret must be at least 32 characters` | Set a longer `BUDDY_JWT_SECRET` |
| "This needs a newer server" on a page | The API runs older code: see "Update after `git pull`" |
| Coach answers "I cannot reach my coaching brain right now" with `openai_compatible` | The model server is not running: start Ollama (or LM Studio), or switch back to `dev` |
| Coach answers start with "(development coach)" | Expected without an API key; see "Real AI answers" |
| Integration tests are skipped | Set `BUDDY_TEST_DATABASE_URL` |
