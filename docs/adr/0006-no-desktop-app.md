# ADR-0006: Web and mobile only – no desktop app

- Status: accepted
- Date: 2026-11-19
- Supersedes: the desktop part of [ADR-0001](0001-tech-stack.md)

## Context

ADR-0001 planned a desktop app (Tauri 2 wrapping the web app) next to web, iOS and Android.
The product owner decided the product ships as a web app and a mobile app only.

## Decision

- Clients are `apps/web` (React) and `apps/mobile` (Expo, iOS and Android). There is no `apps/desktop`.
- Desktop users use the web app in their browser; it works on any screen size.
- Tauri, its Rust toolchain, its CORS origin (`tauri://localhost`) and its build settings are removed.

## Consequences

- One client fewer to build, test, sign and release; no Rust toolchain in CI.
- Shared code lives in `packages/` and serves exactly two apps.
- If a desktop app is ever needed again, a new ADR decides it; installing the web app as a
  progressive web app is the cheaper first option.
