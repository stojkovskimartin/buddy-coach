# ADR-0004: Registration reveals whether an email exists (until email verification)

- Status: accepted (temporary)
- Date: 2026-11-18

## Context

`POST /auth/register` answers 409 for a taken email. That lets someone check whether an email has
an account. Login avoids this (same message and timing for unknown users and wrong passwords).
The clean fix is a uniform "check your inbox" response plus email verification, which needs an
email provider we do not have yet.

## Decision

- Keep the 409 for now; registration UX stays simple during development and beta.
- Before public launch: add email verification (milestone "accounts v2"), switch register to a
  uniform 202 response, and add per-IP rate limiting on all `/auth/*` endpoints.

## Consequences

Account existence can be probed during the closed beta. Tracked in `docs/backlog.md`.
