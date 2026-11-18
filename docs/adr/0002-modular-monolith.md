# ADR-0002: Start as a modular monolith with service boundaries

- Status: accepted
- Date: 2026-11-18

## Context

The target architecture has about nine services (profile, nutrition, training, wellness, planning, progress, integration, coach, gateway).
Running nine deployables from day one multiplies infrastructure, latency and failure modes before there are users.

## Decision

- One FastAPI application (`services/api`) with one package per domain module.
- Each module owns its tables (prefixed by module name), its repository, service and router.
- Modules communicate through service interfaces and an in-process **event bus** with the same interface a broker (NATS / RabbitMQ) would have.
- A separate worker process (same codebase) handles background jobs and agent runs triggered by events.

## Consequences

- Extracting a module into its own service later means: move the package, switch the event bus adapter to a broker, call it over HTTP. No domain code changes.
- Boundaries are enforced by import rules checked in tests (`tests/architecture`).
