# Progress

Living status of the project. Updated with every merge to `main`.
Last update: 2026-11-18, 21:21

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

**Mobile app on your phone (with the API running):** see
[apps/mobile/README.md](../apps/mobile/README.md) (Expo Go, same Wi-Fi as the computer).

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

The numbers in this table are project labels used in the merge commits. They are not GitHub
pull request numbers.

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
| #11 | CI on GitHub: lint, types, all tests on Postgres, frontend tests, API contract drift on every PR and push to main | runs everything |
| #12 | One React version (19.3.0) for web and mobile | – |
| #13 | Mobile app (iOS + Android, Expo): login, Today with goal countdown, coach chat, secure token storage | 36 mobile |
| #14 | Docs: running the mobile app, CI, API client workflow | – |
| #15 | Daily check-in API: sleep, soreness, mood, optional sleep hours, HRV, resting HR, pain; readiness 0-100 with personal baselines, in the athlete's time zone | +42 |
| #16 | Morning check-in on web and mobile (three taps, readiness traffic light), shared wording package `@buddy/shared` | +32 frontend |

Totals: backend 424 tests, frontend 98 tests (shared 13, client 18, web 22, mobile 45); CI runs all of them.

## In progress

- Task tracker with every feature and its status: https://claude.ai/artifact/2uRQPCZYqwALLndwByTcHX

## Next

1. Guided onboarding wizard (web and mobile) and the shared design system: easy first start.
2. Today screen: nutrition targets and today's session next to readiness; the coach uses the check-in.
3. Consent for AI processing and chat history (see `docs/backlog.md`).
4. Food logging (text and grams first, then photo and barcode) feeding the vitamin and mineral check.
5. Workouts with session feedback; HealthKit / Health Connect import on mobile.
6. Desktop app (Tauri) wrapping the web app.

## Open decisions for the product owner

- App name (shortlist: BuddyCoach, Coachli, FuelStride).
- Repository visibility: currently public.
