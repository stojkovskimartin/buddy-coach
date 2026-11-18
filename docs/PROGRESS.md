# Progress

Living status of the project. Updated with every merge to `main`.
Last update: 2026-11-18, 22:10

## How to run it

**Try the API (Windows, macOS, Linux; needs Docker Desktop):**

```bash
git pull
docker compose -f infra/docker-compose.yml up --build
```

Open http://localhost:8000/docs and follow "Try it in 5 minutes" in the README.
Real AI answers: create `infra/.env` with `BUDDY_LLM_PROVIDER=anthropic` and
`BUDDY_ANTHROPIC_API_KEY=...`, then start again.

**Web app (needs Node 22 + pnpm, with the API running):** `pnpm install`, then
`pnpm --filter @buddy/web dev` and open http://localhost:5173.

Full guide: [running.md](running.md).

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
| #6 | Living progress file (this document) | – |
| #7 | Recovery nutrition: vitamins and minerals (D-A-CH references), recovery meals, protein per meal, evidence-graded supplement catalogue (creatine, caffeine, vitamin D, iron, …), 3 coach tools, dose limits in the Safety Guard (ADR-0005) | +46 |
| #8 | Shared typed API client (generated from OpenAPI) and web app: login, onboarding, goals, coach chat | 30 frontend |
| #9 | Full documentation in `docs/` (running, API, agents, science, development, testing) | – |
| #10 | Post-merge review of #7: magnesium limit for supplements only, recovery meal per hour, vitamin D and iron only via a doctor, Safety Guard catches dose phrasings (vitamin D, iron, caffeine pill counts, decimals, Swiss numbers) without blocking food-first answers or warnings | +78 |

Totals: backend 382 tests, frontend 30 tests; lint and strict typing clean; no API contract drift.

## In progress

- Mobile app (Expo, iOS and Android) on `feat/mobile`.
- Task tracker with every feature and its status: https://claude.ai/artifact/2uRQPCZYqwALLndwByTcHX

## Next

1. Mobile app (Expo, iOS and Android): same screens, secure token storage, HealthKit / Health Connect import.
2. Desktop app (Tauri) wrapping the web app.
3. CI on GitHub (lint, types, tests, contract drift on every push) and branch protection.
4. Food logging (photo, text, barcode, grams) feeding the micronutrient assessment.
5. Workout import and session feedback (RPE, feeling, pain).
6. Consent for AI processing, chat history, email verification (see `docs/backlog.md`).

## Open decisions for the product owner

- App name (shortlist: BuddyCoach, Coachli, FuelStride).
- Repository visibility: currently public.
