# Backlog of deferred review findings

Tracked here until GitHub issues are available; each item names the PR that deferred it.

| Item | From | Target |
| --- | --- | --- |
| Email verification, uniform 202 on register, rate limiting on `/auth/*` (ADR-0004) | PR #2 review | Before public launch |
| Scheduled cleanup of expired and revoked refresh tokens | PR #2 review | Milestone 2 |
| CI workflow running every PR on a clean checkout | PR #1, #2 review | PR #6 |
| Store and send coach chat history (endpoint is single-turn) | PR #4 review | Milestone 2 |
| AI-processing consent flag checked before any LLM call; document data sent to the LLM provider (age, sex, height, weight, goal type) in the privacy notice | PR #4 review | Before beta |
| LLM-based safety classifier in addition to the pattern floor; more languages (FR, IT) | PR #4 review | Milestone 3 |
| Low-kcal output check: snack words after the number can mask daily limits ("eat only 800 kcal, drink water") | PR #4 re-review | Next coach PR |
| Web: move tokens from localStorage to httpOnly, SameSite cookies (needs a backend cookie auth mode); CSP mitigates meanwhile | feat/clients review | Before public launch |
