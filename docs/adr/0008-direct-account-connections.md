# ADR-0008: Direct account connections

- Status: accepted
- Date: 2026-11-19

## Context

Some devices do not reach the phone's health store, and some athletes want their data without
the phone app (ADR-0007). Vendors offer cloud APIs with OAuth 2. Withings (smart scales) is open
to any developer for free, and so is WHOOP (workouts); Strava and Polar follow, Garmin and
Google Health are gated.

## Decision

- Module `integrations` owns one connection per user and provider: OAuth tokens encrypted with
  Fernet (`BUDDY_INTEGRATIONS_KEY`), the provider's "changed since" cursor and the last sync time.
  A provider is offered only when the operator set its client id and secret and the key.
- OAuth returns to the web app (`/connections/callback`), which posts `code` and `state` to the API
  with the athlete's own bearer token. `state` is a signed, 10-minute token naming the user and
  provider, so a code is only ever linked to the account that started the sign-in. The redirect
  URL comes from configuration only; it must be https in production.
- Sync is on demand ("Sync now", and once right after connecting), at most every 10 minutes
  (Withings' polling rule). A row lock serialises syncs, so a rotated refresh token is never used
  twice; the claim and any new token are committed before data is fetched, and the cursor is
  saved only after every page was imported. The first sync brings in the last year.
- Data goes through the owning module's service (weights through `body`, workouts through
  `workouts`), with the provider as its source, so imports stay idempotent by (source,
  external_id). Unusable records (guests on the scale, dates in the future, implausible values)
  are left out and counted as skipped, so one bad record never blocks a sync.
- Each provider client (`ProviderClient`: authorize URL, code exchange, refresh, pull) owns its
  paging and the meaning of its cursor: Withings' own "changed since" time; for WHOOP, which has
  none and rescores workouts for a while, the time of our last sync, read again from 7 days
  before it.
- A refused token disconnects the account and asks the athlete to connect again (409
  `reconnect_required`); other provider failures are 502 `provider_error` and change nothing.
- A device that also writes to Apple Health or Health Connect would be counted twice; the
  Connections page tells the athlete to use one path per device.

## Consequences

- Webhooks, background sync, revoking at the provider on disconnect and cross-source duplicate
  detection are left for later (`docs/backlog.md`).
- Each provider is a small client next to the module's service; the module grows per provider
  without a plugin framework.
