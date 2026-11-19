# Progress

Living status of the project. Updated with every merge to `main`.
Last update: 2026-11-19, 02:38

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
| #17 | Progress and API docs after the check-in | – |
| #18 | Test for invalid check-ins; a midnight-flaky coach test fixed | +1 |
| #19 | Web and mobile only: desktop app removed everywhere (ADR-0006) | – |
| #20 | Today's calorie and macro targets API, training energy estimated from available time | +21, +1 frontend |
| #21 | Workouts from every source (import, manual, feedback) and training load: fitness, fatigue, form, weekly ramp | +40 |
| #22 | Docs in sync after #18-#21 (architecture, API, progress) | – |
| #23 | Workouts from Apple Health and Health Connect on the phone (read only, foreground sync, incremental) – ADR-0007 | +46 frontend |

Totals: backend 486 tests, frontend 146 tests (shared 13, client 20, web 22, mobile 91); CI green (lint, strict types, tests, no API contract drift).

## In progress

- Task tracker with every feature and its status: https://claude.ai/artifact/2uRQPCZYqwALLndwByTcHX

## Next

One at a time, each challenged before coding and reviewed after (tracker numbers in brackets):

1. Quick actions: tick boxes and one-tap coach suggestions [8.3.1, 8.3.2].
2. Today screen: targets and session cards; the coach uses the same numbers [4.2.3, 4.2.4, 8.2.3, 8.2.4].
3. Log a workout in a few taps; training energy from logged workouts in the targets [6.4.1, 6.1.6].
4. Latest stable versions of the whole stack, as its own reviewed change [1.2.4].

## Open decisions for the product owner

- App name (shortlist: BuddyCoach, Coachli, FuelStride).
- Repository visibility: currently public.
