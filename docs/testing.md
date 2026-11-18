# Testing

| Kind | Where | Needs | What it proves |
| --- | --- | --- | --- |
| Unit | `services/api/tests/unit` | nothing | engines, security, config, error handling, domain rules |
| Architecture | `services/api/tests/architecture` | nothing | module boundaries, pure engines |
| Agents | `services/api/tests/agents` | scripted LLM (some need Postgres) | agent limits, tool permissions, safety, routing, provider mapping |
| Integration | `services/api/tests/integration` | Postgres | endpoints, transactions, concurrency, migrations = models |
| Client | `packages/*/src/**/*.test.ts`, `apps/web/src/**/*.test.ts(x)` (Vitest), `apps/mobile/__tests__` (jest-expo) | nothing | API client auth and refresh, web and mobile screens, secure token storage |
| End-to-end | `e2e/` (planned) | running stack | full user journeys in the apps |

## Principles

- Every new rule gets a test for the allowed and the refused case.
- Safety rules get tests for false alarms as well as for missed red flags.
- LLM behaviour is tested with a scripted provider: tests check which tools were called with
  which arguments and what the engines returned, never the wording of a real model.
- Concurrency bugs are tested with real parallel requests against Postgres.
- A failing test is never weakened or deleted to make a change pass.

## Commands

See [running.md](running.md#3-run-the-tests).

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- **Backend:** ruff, ruff format, mypy and the full pytest suite against Postgres 16.
- **Frontend:** `pnpm typecheck` and `pnpm test` for every workspace package.
- **Contract drift:** regenerates the API client and fails if it differs from the commit.

Actions are pinned to commit SHAs and kept current by Dependabot. CI must be green before a
merge (see [development.md](development.md)); enforcing this with branch protection is in
[backlog.md](backlog.md).
