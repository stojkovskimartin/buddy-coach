# ADR-0001: Two languages – Python backend, TypeScript clients

- Status: accepted
- Date: 2026-11-18

## Context

The product needs a backend with an AI agent network, a web app, iOS and Android apps and a desktop app.
Every extra language adds contract translation, tooling and review load, for humans and for AI agents.

## Decision

- **Backend and agents:** Python 3.13 with FastAPI, Pydantic v2, SQLAlchemy 2 (async) and Alembic.
  The AI ecosystem (LLM SDKs, evaluation, vision) is strongest in Python, and agents live next to the domain code they call.
- **All clients:** TypeScript.
  - Web: React + Vite.
  - Mobile: Expo (React Native) – one codebase for iOS and Android, native modules for HealthKit and Health Connect.
  - Desktop: Tauri 2 wrapping the web app – small, fast, signed installers; the Rust shell stays minimal.
- **Contract:** FastAPI's OpenAPI document is the single source of truth. `packages/api-client` is generated from it, so a backend change that breaks a client fails the type check.
- **Tooling:** uv (Python), pnpm + Turborepo (TypeScript), one monorepo.

## Consequences

- One API contract, two languages, one repo: low coordination cost.
- CPU-heavy work (e.g. large FIT file parsing) may later move to a worker process; Python stays the language.
- Tauri needs a Rust toolchain in CI for desktop builds, but almost no Rust code.
