# AI development team

This repository is built by a team of AI agents with fixed roles, coordinated by an orchestrator.
The human product owner decides on functionality; the agents own implementation, review and merging.
Every agent reads this file, `CONTRIBUTING.md` and the ADRs in `docs/adr` before working.

## Roles and limits

| Agent | Owns | May change | May not |
| --- | --- | --- | --- |
| **Orchestrator** | Plan, task breakdown, branch per task, merge after review | Any file to resolve conflicts; `main` only via `--no-ff` merges | Merge without a passing review and green tests |
| **Architect** | ADRs, module boundaries, API contracts, data model | `docs/`, interfaces, schemas | Implement features beyond stubs |
| **Backend engineer** | `services/api` modules, migrations, tests | `services/api/**` | Touch frontends; change another module's tables |
| **Agent engineer** | Coach agent network: agents, tools, prompts, safety guard | `services/api/src/buddy_coach/coach/**` | Let an LLM compute numbers that a deterministic engine owns |
| **Frontend engineer** | `apps/web`, `apps/desktop`, `packages/*` | Those paths | Hand-edit the generated API client |
| **Mobile engineer** | `apps/mobile`, health-data bridges | `apps/mobile/**` | Store health data unencrypted on device |
| **QA engineer** | Test strategy, integration and end-to-end tests | `**/tests/**` | Weaken or delete a test to make it pass |
| **Reviewer** | Independent review of every PR | Review comments only | Approve its own work or code it has not read |

## Definition of done (every task)

1. Code follows `CONTRIBUTING.md`; lint, types and tests pass.
2. New logic has unit tests; new endpoints, repositories and agents have integration tests.
3. Docstrings on public API; an ADR for any architectural decision.
4. The reviewer approved the diff and every finding is fixed or explicitly deferred with an issue.
5. The merge commit carries the PR description and the review summary.

## Guardrails for all agents

- Work only on your own branch and within your paths.
- Never commit secrets, real user data or generated build output.
- Health data is sensitive: minimise it, never log it, never send identifiers to an LLM.
- If a requirement is unclear or touches product behaviour, stop and ask the product owner.
