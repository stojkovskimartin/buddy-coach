# Progress

Living status of the project. Updated with every merge to `main`.
Last update: 2026-11-20, 01:30

## How to run it

**Try the API (Windows, macOS, Linux; needs Docker Desktop):**

```bash
git pull
docker compose -f infra/docker-compose.yml up --build
```

Open http://localhost:8000/docs and follow "Try it in 5 minutes" in the README.
Real AI answers, free with a local model or paid: docs/running.md, "Real AI answers".

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
BUDDY_TEST_DATABASE_URL=postgresql+asyncpg://buddy:buddy@127.0.0.1:5433/buddy_test uv run pytest
```

(The Docker stack exposes Postgres on 127.0.0.1:5433, user/password `buddy`.)

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
| #23 | Workouts from Apple Health and Health Connect on the phone (read only, foreground sync, incremental) – ADR-0007 | +47 frontend (mobile 46, client 1) |
| #25 | Readable offline coach answers that say how to switch on the real AI; web favicon | +2 |
| #26 | The coach reads stored data on the athlete's day: today's targets, check-in readiness and training load (same numbers as the app) | +2 |
| #27 | Free AI for the coach: any OpenAI-compatible model (Ollama or LM Studio on your computer, Groq, Gemini, OpenRouter) | +9 |
| #28 | Today's food targets card on web and mobile: calories, protein, carbs, fat and why | +6 frontend (web 3, mobile 3) |
| #29 | Body weight: manual entries, smart-scale sync API, 7-day trend; the newest weight updates the profile and the targets | +13 |
| #30 | Weight on web and mobile: latest weight, 90-day trend chart, quick entry, delete a wrong reading | +15 frontend (shared 6, client 2, web 4, mobile 3) |
| #31 | Smart scales: the phone reads body weight from Apple Health / Health Connect and keeps it up to date; phones connected earlier get an "Allow weight" step | +10 frontend (client 1, mobile 9) |
| #32 | Food diary API: entries per meal with the portion's nutrients, day totals, daily totals for charts, plausibility checks | +12 |
| #33 | Food page on web: day totals against today's targets, entries per meal, Open Food Facts search and barcode, typed-in food, earlier days | +14 frontend (shared 8, client 1, web 5) |
| #34 | Progress page on web: weight, food against today's target, fitness and fatigue, readiness over 4 weeks, 3 months or a year | +7 frontend (shared 4, client 1, web 2) |
| #35 | The coach knows what you ate and how your weight moves: food today, food over 7 days, weight trend (totals only, no food names) | +2 |
| #36 | Photos API: meal, progress and profile photos, shrunk to 1280 px without EXIF/GPS, private, meal photos expire after 90 days | +13 |
| #37 | Photos on web: meal photos on the food page, progress photos on the progress page, profile picture on the profile page; the current avatar is returned however old | +4 frontend (client 1, web 3) |
| #38 | Watch files and connections API: FIT activity upload (Garmin, Coros, Polar, Suunto, Wahoo), sources of workouts and weights | +8 |
| #39 | Connections page on web: phone health app, watch-file upload, typed-in data, planned direct accounts | +4 frontend (shared 1, client 1, web 2) |
| #40 | Feedback fixes: the app says when the server is older than the app (instead of "Not Found"), profile picture inside the page, long coach answers wrap, the offline coach shows all of its data; update steps in the docs | +1 frontend (client 1) |
| #41 | The API starts with `uv run --env-file .env` on Windows: allowed web origins accept a comma-separated list (the JSON form lost its quotes) | +3 |
| #42 | `CLAUDE.md`: Claude Code in the IDE runs the same cycle (challenger, checks, reviewer, docs, PR, CI, merge) | – |
| #43 | Direct accounts: connect a Withings account on the Connections page (OAuth, tokens encrypted, sign-in bound to the user), the last year of weigh-ins on connect, "Sync now" every 10 minutes, disconnect – ADR-0008 | +20, +7 frontend (shared 1, web 6) |
| #44 | WHOOP account: workouts of the last year on connect, then from a week before the last sync (WHOOP rescores late); unusable records skipped; providers share one client interface | +8, +1 frontend (web 1) |
| #46 | Mobile Food tab: the day's diary against today's targets, earlier days, Open Food Facts search, barcode scan with the camera, typed-in food | +7 frontend (mobile 7) |
| #47 | Mobile Progress tab: weight, food against the target, fitness and fatigue, readiness over 4 weeks, 3 months or a year; summaries shared with the web | +5 frontend (shared 1, mobile 4) |
| #48 | Mobile photos and Connect tab: meal, progress and profile photos taken with the camera or picked (shrunk on the phone, no metadata); data sources and Withings/WHOOP sync and disconnect | +7 frontend (mobile 7) |
| #49 | Demo data: `python -m buddy_coach.demo` creates a demo athlete with 120 days of check-ins, workouts, weigh-ins and meals through the API (development only); the owner's new task list in Next | +2 |
| #50 | Time zones work on Windows: the API ships the `tzdata` package, so `Europe/Zurich` and every other zone load without a system time zone database (the demo data script failed on Windows); tests no longer read a developer's own `.env`; the database is reached at `127.0.0.1` (on Windows `localhost` costs 2 s per connection); running.md explains an old API container that shadows port 8000 | +3 |

Totals: backend 583 tests, frontend 234 tests (shared 34, client 28, web 48, mobile 124); CI green (lint, strict types, tests, no API contract drift).

## In progress

- Task tracker with every feature and its status: https://claude.ai/artifact/2uRQPCZYqwALLndwByTcHX

## Next

The owner's priorities of 20 Nov 2026, challenged by an agent; one at a time, each challenged
before coding and reviewed after (tracker 12.x):

1. Fake providers for clicking without keys or internet: dev OAuth provider, dev food recognizer,
   Mailpit for e-mail in Docker [12.2].
2. Languages: English and Macedonian, every text translated, dates and numbers per language;
   the coach answers in Macedonian once its safety rules cover it [12.3].
3. New design: design system, navigation, light / dark / system theme, contrast checked in both [12.4].
4. Settings: language, theme, units, consents, data export, account deletion of everything [12.5].
5. Privacy: notice, consent per purpose (AI, food photos, each account), no AI call without it [12.6].
6. Free hosting: one small free server, HTTPS, encrypted off-site backups, a restore tested [12.7].
7. Accounts v2: e-mail verification, password reset by code, login limits and a free CAPTCHA,
   secure cookies on the web [12.8].
8. Second factor: authenticator app (TOTP) and passkeys with recovery codes, verified backup
   e-mail, device list; a reset still asks for the second factor. SMS codes left out: they cost
   money [12.9].
9. Photos hardened: encrypted at rest, scheduled clean-up, quota [12.10].
10. Food photo recognition: a vision model suggests the dish and items, the athlete confirms items
    and grams, nutrients come from the food database; free local model by default [12.11].
11. Connections hub: status, last sync, history, what to import; Polar and Oura; QR code to the
    phone app for Apple Health and Health Connect; Garmin and Strava shown with the reason [12.12].
12. Web parity: workout logging, goals, check-in history [12.13].
13. Click-through tests of every feature in the browser, in CI [12.14].

After that: mobile setup and goals on the phone, quick actions, today's session card, latest
stack versions [3.2.2, 8.3.1, 4.2.4, 1.2.4].

## Open decisions for the product owner

- Strava: its API agreement forbids using Strava data in AI models or similar applications, which
  includes an AI coach. Build it only with Strava's written permission; until then Strava workouts
  arrive through the phone health app or watch files.
- E-mail sending (verification, password reset) needs a domain for reliable delivery, about
  CHF 10 a year; the only cost in the plan. Free alternative: a Gmail address with an app
  password, often landing in spam.
- Food recognition: free by default with a model on your computer (Ollama); a hosted model
  (OpenAI, paid; Gemini free tier, which may use the photos for training) only by your choice.
- App name (shortlist: BuddyCoach, Coachli, FuelStride).
- Repository visibility: currently public.
