@AGENTS.md

# Working on Buddy Coach with Claude Code

You work alone for the product owner (Martin) and run the whole cycle yourself, without asking,
except for product decisions and anything that can't be undone. The rules in `AGENTS.md`,
`CONTRIBUTING.md` and `docs/development.md` apply; this file says how to apply them here.

## Every change

1. `git switch main && git pull --ff-only`, then a branch `feat/…`, `fix/…`, `docs/…`, `chore/…`.
2. **Challenger first:** before writing code, give a subagent (Plan) the design and ask it to find
   flaws, security holes and simpler options. Adopt what is right.
3. Implement the smallest change that does what was asked: no extra features, files or
   abstractions. Follow the existing module layout and patterns; read neighbouring code first.
4. Tests for every new rule (allowed and refused case); integration tests for endpoints.
5. Run all checks (below) until green.
6. **Reviewer after:** a fresh subagent reviews `git diff main...HEAD` for bugs, security, missing
   tests and unnecessary code. Fix every blocking finding; defer the rest to `docs/backlog.md`.
7. Update docs in the same branch: `docs/PROGRESS.md` (a row per PR, test totals, "Last update"),
   and `docs/api.md`, `docs/architecture.md`, `docs/running.md`, `docs/backlog.md`, ADRs where the
   change touches them. Docs say what is true now; no history, no "new" or "now".
8. Commit with a Conventional Commits message and stage explicit paths only (never `git add -A`).
9. Push, open the PR with `gh pr create`, wait for CI with `gh pr checks --watch`.
10. Merge locally: `git switch main && git merge --no-ff <branch> -m "Merge: <title> (#N)"`,
    `git push`, `git push origin --delete <branch>`. `#N` is the next project label in
    `docs/PROGRESS.md` (not the GitHub PR number).

The task tracker sheet lives in claude.ai; the claude.ai session updates it from `docs/PROGRESS.md`.

## Checks

Postgres for the integration tests comes from Docker (`docker compose -f infra/docker-compose.yml up -d db`).

```powershell
cd services/api
uv sync
uv run ruff check . ; uv run ruff format --check . ; uv run mypy
$env:BUDDY_TEST_DATABASE_URL = "postgresql+asyncpg://buddy:buddy@127.0.0.1:5433/buddy_test"
uv run pytest
cd ../..
pnpm install
pnpm api:generate   # after any API change; commit openapi.json and src/generated
pnpm typecheck ; pnpm test
```

## Never

- Commit secrets, `.env` files, real user data or build output. Never print or read API keys or
  tokens from `.env`.
- Log health data, or send user identifiers, food names or free text to an LLM.
- Weaken or delete a test to make it pass.
- Write outside this repository.
- Install global npm packages or anything with admin rights.

## Where things stand

`docs/PROGRESS.md` lists every merged PR; `docs/backlog.md` lists deferred findings; the
"Next" section of `docs/PROGRESS.md` is the work queue, top first.
