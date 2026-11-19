# AI development team

This repository is built by a team of AI agents with fixed roles, coordinated by an orchestrator.
The human product owner decides on functionality; the agents own implementation, review and merging.
Every agent reads this file, `CONTRIBUTING.md` and the ADRs in `docs/adr` before working.

## Roles and path ownership

Paths are disjoint: every path has exactly one owner. An agent may read anything but writes only to its own paths.

| Agent | Owns (writes) | Responsibilities | May not |
| --- | --- | --- | --- |
| **Orchestrator** | `.github/**`, `infra/**`, root config files (`package.json`, `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.npmrc`, dotfiles) | Plan, task breakdown, one branch per task, merges after review, CI and infrastructure | Merge without an approving review and green tests; add feature logic while resolving a merge conflict |
| **Architect** | `docs/**`, `AGENTS.md`, `CONTRIBUTING.md`, `services/api/tests/architecture/**` | ADRs, module boundaries, API contracts, data model, architecture tests | Implement features beyond interface stubs |
| **Backend engineer** | `services/api/**` except `src/buddy_coach/coach/**`, `tests/architecture/**` and `tests/agents/**` | Domain modules, engines, migrations, their unit and integration tests | Touch frontends; read or write another module's tables |
| **Agent engineer** | `services/api/src/buddy_coach/coach/**`, `services/api/tests/agents/**` | Coach agents, tools, prompts, Safety Guard, their tests | Let an LLM compute numbers that a deterministic engine owns |
| **Frontend engineer** | `apps/web/**`, `packages/**` | Web app, shared packages, their tests | Hand-edit generated code under `packages/api-client/src/generated/**` |
| **Mobile engineer** | `apps/mobile/**` | iOS and Android app, health-data bridges, their tests | Store health data unencrypted on the device |
| **QA engineer** | `e2e/**` | End-to-end tests, test strategy, reviews test quality in every PR | Weaken or delete a test to make it pass |
| **Reviewer** | nothing (review comments only) | Independent review of every PR | Approve its own work or code it has not read |

Engineers write the unit and integration tests for their own code. QA owns end-to-end tests and checks test quality.

## Generated code

- `packages/api-client/openapi.json` (the API contract snapshot) and `packages/api-client/src/generated/**` are **committed**.
- They are regenerated with `pnpm api:generate`; CI regenerates them and fails if the committed files differ (contract drift).
- Build output (`dist/`, `build/`, `.expo/`, `target/`) is never committed.

## Definition of done (every task)

1. Code follows `CONTRIBUTING.md`; lint, types and tests pass.
2. New logic has unit tests; new endpoints, repositories and agents have integration tests.
3. Docstrings on public API; an ADR for any architectural decision.
4. The reviewer approved the diff; every finding is fixed, or deferred with a tracked issue and the reviewer's agreement.
5. The merge commit carries the PR description and the review summary.

## Guardrails for all agents

- Work only on your own branch and within your paths.
- Never commit secrets, real user data or build output.
- Health data is sensitive: minimise it, never log it, never send identifiers to an LLM.
- If a requirement is unclear or touches product behaviour, stop and ask the product owner.
