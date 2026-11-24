# Architecture overview

The full product and architecture spec lives in the shared doc "Personal Buddy Coach – Product Idea & Architecture"
(https://claude.ai/artifact/SqPXjz5TMEAgVJLkAr3qhj). This file holds the requirements agents need, so the repo is self-contained.

## Product requirements (summary)

- Users: beginners to professionals; goals: lose/gain/maintain weight, endurance events (run, bike, swim, triathlon, Ironman), mountain sports (hiking, ski touring, skiing), strength, general fitness.
- Onboarding: body data, sport history, injuries and health screening, availability, food habits, device connection, coach style.
- Daily loop: morning check-in → readiness and today's plan → meal logging (photo, text, barcode, grams) → workout import + feedback (RPE, feeling, pain) → evening summary.
- Weekly and monthly reviews; adaptive calorie/macro targets; adaptive training plans; motivation (streaks, milestones, nudges).
- Devices: Apple HealthKit and Android Health Connect first, FIT upload, aggregator for Garmin and others later.
- Clients: iOS, Android and web (no desktop app, ADR-0006).
- Safety: hard limits on deficits, weight-change rate and training ramp; red flags escalate to professionals; adults only at launch.
- Non-functional: secure (health data), reliable, observable, horizontally scalable API, every feature tested.

## Layers

1. **Clients** – web (React) and mobile (Expo). Both use the generated `@buddy/api-client` and `@buddy/shared`.
   The web app's look comes from plain CSS in `apps/web/src/styles/` (tokens, base, layout, components,
   pages): every colour is a `light-dark()` token pair, so one value serves both themes, and a test
   checks their contrast. No inline styles, so the strict Content Security Policy holds.
   Languages: English and Macedonian. Shared wording lives in `@buddy/shared` (`SHARED_TEXT`), each app's
   own texts in its catalog (`apps/web/src/i18n/messages.ts`); the Macedonian catalog must have every
   English key (typecheck). Server errors are translated by their `code`; English shows the server's text.
2. **API** – FastAPI app in `services/api`, versioned under `/api/v1`, JWT auth, RFC 9457 errors.
3. **Domain modules** – `identity`, `profile`, `checkin`, `nutrition`, `workouts`, `body` (weight, smart scales), `meals` (food diary), `media` (photos), `integrations` (directly connected accounts), `coach`, `privacy` (data export, account deletion; no tables), `health` (probes). Planned: `planning`, `progress`.
4. **Engines** – pure, deterministic science code in `science/`: nutrition targets, micronutrients, recovery nutrition, supplements, training load, readiness.
5. **Coach agent network** – Head Coach + specialists + Safety Guard, acting only through tools (ADR-0003).
6. **Infrastructure** – PostgreSQL (TimescaleDB and pgvector later), Redis, an event bus (in-process now, broker later).

## Module layout

Only the files a module needs:

```
buddy_coach/<module>/
  domain.py      pure logic and value objects, no I/O
  models.py      SQLAlchemy tables owned by this module
  schemas.py     Pydantic request/response models
  repository.py  persistence
  service.py     use cases; the only entry point other modules may call
  events.py      domain events it publishes
  deps.py        FastAPI dependency wiring
  router.py      HTTP endpoints
```

Modules never read each other's tables. A module that needs another one's data depends on a
small `Protocol` and gets a plain value back (e.g. `ProfileService.athlete_snapshot` returns an
`AthleteSnapshot`). "Today" always comes from the injected clock (`core.deps.get_clock`) and the
athlete's time zone (`core.clock.local_date`).

## Device data flow

```
Watch / app ──► Apple Health (iPhone) or Health Connect (Android) ──► mobile app ──┐  (ADR-0007)
Watch / app ──► vendor cloud API (WHOOP, Garmin, Fitbit, ...) ──► integrations ────┤  (planned)
FIT file upload ──► POST /workouts/fit (Garmin FIT SDK) ───────────────────────────┤
                                                                                    ▼
                                                                        POST /workouts/import
Athlete ──► manual log ──► POST /workouts                                           │
                 │                                                                  │
                 └──────────────► one load per workout (session RPE) ◄──────────────┘
                                                │
              GET /training/load: fitness, fatigue, form, ramp (computed when read)
```

Photos are files (local disk now, an S3-compatible store later), shrunk and stripped of EXIF/GPS
on upload; the database holds only their records. Meal photos expire after
`BUDDY_MEAL_PHOTO_RETENTION_DAYS` (removed on the user's next upload until a scheduled job exists);
food entries stay. The coach never imports `media`: photos never reach the model.

Food search and barcodes go from the apps straight to Open Food Facts, so its rate limits apply
per user; the server only stores the diary entries (`meals`), never the food database.

Smart scales take the same phone path to `POST /body/weights/import`, or come straight from a
connected Withings account (`integrations`, ADR-0008); the newest weight becomes the profile's
weight, so targets and the coach always use it.

Imports are idempotent by (source, external_id); the athlete's own rating is never overwritten
by a re-sync. Phone sync (ADR-0007), FIT upload and direct accounts (ADR-0008) bring data in.

## Data export and account deletion

The `privacy` module owns no tables and nothing imports it (an architecture test checks this).
Every module with user data offers `export_user(user_id)` (its own rows as plain data) and
`erase_user(user_id)` (one bulk delete per table); both use the request's session and never
commit. The coach stores nothing.

`POST /account/delete` runs in two transactions:

1. Check the password, mark the account inactive, revoke every refresh token; commit. From now on
   access tokens are refused (`authenticate_access_token` checks `is_active`) and no refresh works.
2. `erase_user` of profile, check-in, workouts, body, meals, media, integrations and identity, in
   that order (the account last); commit. Then the user's photo folder is removed
   (`PhotoStorage.delete_user`; a failure is logged with the user id only).

A request authenticated just before step 1 committed can still write after step 2 (for example a
meal saved or a photo file written in the same second). The window is a single request long;
the rows it leaves have no account and no way to be read. A sweep of such orphans and of photo
folders without an account is in the backlog. If step 2 fails, the account stays inactive with its
data; the user cannot log in, so an operator finishes it.

## Decisions

See `docs/adr/`.
