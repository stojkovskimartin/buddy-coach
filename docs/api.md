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
| `conflict` | 409 | Duplicate (e.g. email already registered) |
| `internal_error` | 500 | Unexpected; details are only in the server logs (by `X-Request-ID`) |

Every response carries `X-Request-ID`; send your own to correlate client and server logs.
