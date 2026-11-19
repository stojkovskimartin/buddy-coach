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
2. **API** – FastAPI app in `services/api`, versioned under `/api/v1`, JWT auth, RFC 9457 errors.
3. **Domain modules** – `identity`, `profile`, `nutrition`, `training`, `wellness`, `coach` (more to come: `planning`, `progress`, `integration`).
4. **Engines** – pure, deterministic science code: nutrition targets, training load, readiness.
5. **Coach agent network** – Head Coach + specialists + Safety Guard, acting only through tools (ADR-0003).
6. **Infrastructure** – PostgreSQL (TimescaleDB and pgvector later), Redis, an event bus (in-process now, broker later).

## Module layout

```
buddy_coach/<module>/
  domain.py      pure logic and value objects, no I/O
  models.py      SQLAlchemy tables owned by this module
  schemas.py     Pydantic request/response models
  repository.py  persistence
  service.py     use cases; the only entry point other modules may call
  router.py      HTTP endpoints
```

## Decisions

See `docs/adr/`.
