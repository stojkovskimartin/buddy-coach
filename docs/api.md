# API

Base path `/api/v1`. The live, always-current reference is the OpenAPI page at
http://localhost:8000/docs (disabled in production, as is `/openapi.json`). The apps use a
committed snapshot of the contract, `packages/api-client/openapi.json`.

## Authentication

1. `POST /auth/register` `{email, password}` → the account (password 10–128 characters).
2. `POST /auth/login` `{email, password}` → `{access_token, refresh_token, expires_in}`.
3. Send `Authorization: Bearer <access_token>` on every other call. Access tokens live 15 minutes.
4. On a 401, call `POST /auth/refresh` `{refresh_token}` → a new pair. The old refresh token is
   revoked. Reusing it later revokes all of the user's sessions (theft detection); reuse within
   10 seconds is tolerated for parallel refreshes from mobile apps.
5. `POST /auth/logout` `{refresh_token}` revokes the session.

The shared TypeScript client (`@buddy/api-client`) does steps 3–4 automatically.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Get tokens |
| POST | `/auth/refresh` | Rotate tokens |
| POST | `/auth/logout` | Revoke a refresh token |
| GET | `/users/me` | The current account |
| GET | `/profile` | Body data and preferences (404 before onboarding) |
| PUT | `/profile` | Create or replace the profile (adults only) |
| GET | `/goals?status=active` | Goals, newest first |
| POST | `/goals` | Create a goal; a new primary goal demotes the old one |
| PATCH | `/goals/{id}` | Change a goal's status |
| PUT | `/checkins/today` | Create (201) or replace (200) today's check-in; the server picks the day in the athlete's time zone |
| PUT | `/checkins/{day}` | Same for a given day (today or up to 7 days late) |
| GET | `/checkins/today`, `/checkins/{day}` | One check-in with its readiness (404 until entered) |
| GET | `/checkins?from=&to=` | Check-ins, newest first (default 14 days, max 92) |
| GET | `/nutrition/targets/today` | Today's calories and macros from profile and main goal; training energy estimated from available time (404 before onboarding) |
| POST | `/workouts/import` | Sync up to 500 workouts from a device or app; idempotent by (source, external_id); returns created / updated |
| POST | `/workouts/fit` | Import a FIT activity file from a watch (raw body, max 10 MB, 413 above); one workout per session, uploading it again updates it |
| GET | `/workouts/sources` | Where workouts come from: per source the count and the latest start |
| POST | `/workouts` | Log a workout by hand (201) |
| GET | `/workouts?from=&to=` | Workouts, newest first (default 28 days, max 366) |
| PATCH | `/workouts/{id}/feedback` | Effort (RPE 1-10), feeling (1-5), pain; recomputes the load |
| DELETE | `/workouts/{id}` | Delete a workout (204) |
| GET | `/training/load?days=42` | Fitness, fatigue, form per day, acute:chronic ratio, weekly ramp check (7-366 days) |
| POST | `/body/weights` | Log a weight by hand (201); the newest weight becomes the profile's weight |
| POST | `/body/weights/import` | Sync up to 500 smart-scale weights from Apple Health or Health Connect; idempotent by (source, external_id); readings outside 30-300 kg are skipped; returns created / updated / skipped |
| GET | `/body/weights?from=&to=` | Weights (newest first) and a 7-day trend of the morning weights (default 90 days, max 366) |
| GET | `/body/weights/sources` | Where weights come from: per source the count and the latest measurement |
| DELETE | `/body/weights/{id}` | Delete a weight (204); the profile keeps the newest one left. `PUT /profile` still sets the weight directly; the next measurement replaces it |
| POST | `/meals/entries` | Add a food with the nutrients of the portion (201); the day is the athlete's; plausibility checked (macros ≤ weight, kcal ≤ 9 per gram) |
| GET | `/meals/entries?day=` | One day of the food diary (default today) in the order eaten, with totals |
| DELETE | `/meals/entries/{id}` | Delete a diary entry (204) |
| GET | `/meals/daily?from=&to=` | Calories and macros per day with entries, oldest first (default 28 days, max 366) |
| POST | `/photos?kind=meal\|progress\|avatar` | Upload a photo as the raw JPEG, PNG or WebP body (max 10 MB, 413 above); stored shrunk to 1280 px with a 320 px thumbnail, without EXIF/GPS; a new avatar replaces the old one (201) |
| GET | `/photos?kind=&from=&to=` | Photos, newest first (default 90 days, max 366); `kind=avatar` without dates gives the current profile picture |
| GET | `/photos/{id}/image?size=full\|thumb` | The JPEG (never cached) |
| DELETE | `/photos/{id}` | Delete a photo and its files (204) |
| POST | `/coach/chat` | Ask the coach (single message, max 2000 characters) |
| GET | `/health/live`, `/health/ready` | Probes for load balancers (no `/api/v1` prefix) |

## Errors

All errors are [RFC 9457 problem details](https://www.rfc-editor.org/rfc/rfc9457) with
`Content-Type: application/problem+json`:

```json
{"type": "https://errors.buddy-coach.app/not_found", "title": "Resource not found",
 "status": 404, "detail": "Goal not found.", "code": "not_found"}
```

| `code` | Status | Meaning |
| --- | --- | --- |
| `invalid_request` | 422 | Body or parameters fail validation; `errors` lists the fields |
| `validation_failed` | 422 | A business rule failed (e.g. under 18, target weight in the wrong direction) |
| `unauthenticated` | 401 | Missing, invalid or expired token |
| `forbidden` | 403 | Authenticated but not allowed (reserved; not used yet) |
| `not_found` | 404 | Missing, or not yours |
| `payload_too_large` | 413 | Upload larger than the endpoint accepts (photos and FIT files: 10 MB) |
| `conflict` | 409 | Duplicate (e.g. email already registered) |
| `internal_error` | 500 | Unexpected; details are only in the server logs (by `X-Request-ID`) |

Every response carries `X-Request-ID`; send your own to correlate client and server logs.
