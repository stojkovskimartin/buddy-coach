# Progress

Living status of the project. Updated with every merge to `main`.
Last update: 2026-11-18

## How to run it

**Try the API (Windows, macOS, Linux; needs Docker Desktop):**

```bash
git pull
docker compose -f infra/docker-compose.yml up --build
```

Open http://localhost:8000/docs and follow "Try it in 5 minutes" in the README.
Real AI answers: create `infra/.env` with `BUDDY_LLM_PROVIDER=anthropic` and
`BUDDY_ANTHROPIC_API_KEY=...`, then start again.

**Run the backend tests (developers, needs Python 3.13 + uv and a Postgres):**

```bash
cd services/api
uv sync
uv run pytest                      # unit tests
BUDDY_TEST_DATABASE_URL=postgresql+asyncpg://buddy:buddy@localhost:5433/buddy_test uv run pytest
```

(The Docker stack exposes Postgres on localhost:5433, user/password `buddy`.)

## Done

| PR | What | Tests |
| --- | --- | --- |
| #1 | Monorepo, team rules (AGENTS.md), ADRs 0001–0003, security policy | – |
| #2 | Auth (register, login, refresh rotation, logout), profile, goals | 81 |
| #3 | Nutrition engine (BMR, targets, macros, adaptive TDEE), training engine (load, fitness, ramp, readiness) | +78 |
| #4 | Coach agent network: Head Coach + 5 specialists, tool limits, Safety Guard, Anthropic provider | +99 |
| #5 | One-command local run (Docker Compose), "Try it" guide | smoke-tested |

Backend total: 258 tests, lint and strict typing clean.

## In progress

- `feat/micronutrients` – vitamins, minerals, protein distribution, creatine and other
  evidence-based supplements, recovery nutrition; new coach tools.
- `feat/clients` – shared typed API client (done, 8 tests), web app next, then mobile and desktop.

## Next

1. Web app: login, onboarding, goals, coach chat.
2. Mobile app (Expo): same screens, HealthKit / Health Connect import.
3. Desktop app (Tauri) wrapping the web app.
4. CI on GitHub (lint, types, tests, contract drift) and branch protection.
5. Food logging (photo, text, barcode) and workout import.
6. Consent for AI processing, chat history, email verification (see `docs/backlog.md`).

## Open decisions for the product owner

- Who merges: Claude merges and pushes (default), or you merge PRs on GitHub.
- App name (shortlist: BuddyCoach, Coachli, FuelStride).
