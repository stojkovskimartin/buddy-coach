# How work is done

The full rules are in [../CONTRIBUTING.md](../CONTRIBUTING.md) and [../AGENTS.md](../AGENTS.md).
This is the short version.

## Flow of every change

1. Branch from `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`.
2. Small commits with [Conventional Commits](https://www.conventionalcommits.org) messages,
   pushed to GitHub after every finished step (nothing is lost if a session ends).
3. Lint, types and all tests green locally, and the CI run on GitHub green.
4. An independent reviewer agent reviews the diff; findings are fixed or tracked in
   `docs/backlog.md`.
5. Merge into `main` with `--no-ff`; the merge commit carries the summary and the review result.
6. `docs/PROGRESS.md` is updated with the merge.

## Code layout of a backend module

```
buddy_coach/<module>/
  domain.py      pure rules, no framework imports (checked by architecture tests)
  models.py      tables owned by this module (prefixed <module>_)
  schemas.py     request/response models
  repository.py  persistence (private to the module)
  service.py     use cases; the only entry point for other modules
  deps.py        FastAPI dependencies
  router.py      endpoints
  events.py      events the module publishes
```

Architecture tests (`tests/architecture`) fail the build if a module imports another module's
models or repository, or if domain or science code imports a framework.

## Adding a database change

```bash
cd services/api
uv run --env-file .env alembic revision --autogenerate -m "short description"
uv run --env-file .env alembic upgrade head
```

A test (`test_migrations_match_models`) fails if models and migrations drift apart.

## Updating the API client after a backend change

```bash
pnpm api:generate
```

This exports `openapi.json` and regenerates the typed client. Commit both; TypeScript then
shows every app that needs updating, and CI fails if they were forgotten.
