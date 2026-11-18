# Contributing

## Branching model (trunk-based)

- `main` is always releasable and protected: no direct pushes.
- Work happens on short-lived branches cut from `main`:
  - `feat/<scope>-<short-name>` new functionality
  - `fix/<scope>-<short-name>` bug fixes
  - `chore/<short-name>` tooling, config, dependencies
  - `docs/<short-name>` documentation only
  - `refactor/<scope>-<short-name>` behaviour-preserving changes
- Each branch is merged through a pull request with a merge commit (`--no-ff`) so the history shows every PR.
- Releases are tagged on `main` with semantic versions (`v0.1.0`).

## Commits

[Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`, e.g. `feat(nutrition): add adaptive TDEE`.
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`, `build`.

## Pull requests

A PR is ready for review when:

1. It does one thing and is small enough to review in one sitting (aim for < 600 changed lines, excluding the committed generated API client).
2. It has unit tests for all new logic and integration tests for new endpoints, repositories and agents.
3. Lint, type checks and tests pass locally and in CI.
4. The description says what changed, why, how it was tested and any follow-ups.
5. Public functions, classes and modules have docstrings; comments explain *why*, not *what*.

A PR is merged when an independent reviewer approved it and every finding is fixed, or deferred with a tracked issue and the reviewer's agreement.

## Code standards

- **Architecture:** modular monolith. Each domain module (`identity`, `profile`, `nutrition`, ...) owns its models, repository, service and router. Modules talk to each other only through their service interfaces or domain events, never through each other's tables.
- **Layers inside a module:** `router` (HTTP) → `service` (use cases) → `domain` (pure logic, no I/O). The service uses a `repository` for persistence; the domain never imports the repository, the ORM or FastAPI. Dependencies point inward, towards the domain.
- **Types everywhere:** `mypy --strict` for Python, `strict` TypeScript. No `Any` without a comment explaining why.
- **Errors:** raise domain errors (`buddy_coach.core.errors`), never return `None` for failure. The API maps them to RFC 9457 problem details.
- **Security:** no secrets in code, validate all input with Pydantic or Zod, least privilege for agents and services.
- **Patterns only where they earn their place:** prefer simple functions and clear names over abstraction for its own sake.
