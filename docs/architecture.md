# Architecture overview

The full product and architecture spec lives in the shared doc "Personal Buddy Coach – Product Idea & Architecture".
This file summarises what the code implements.

## Layers

1. **Clients** – web (React), mobile (Expo), desktop (Tauri). All use the generated `@buddy/api-client`.
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
