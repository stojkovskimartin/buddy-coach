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
| Safety Guard dose-pattern edge cases: dose after a semicolon ("Take vitamin D; 5000 IU daily"), alternatives ("5000 or 10000 IU"), space-grouped numbers read as one ("Session 3 200 mg" = 3200 mg, safe side). Replace with the AI safety classifier | #7 re-review round 4 | Milestone 3 |
| Mobile: check `EXPO_PUBLIC_API_BASE_URL` is https at build time (app.config.ts or CI), so a wrong value never crashes a release app on launch | #13 re-review | Before app store builds |
| Mobile: verify keyboard layout on a real Android device (edge-to-edge) | #13 re-review | Before beta |
| Branch protection on `main` requiring the CI checks (needs repository admin settings) | docs review | Before beta |
| Nutrition targets: training energy comes from available time (capped 180 min/day); replace with logged workouts and adaptive maintenance | #20 review | With workout logging |
| Workout import: skip invalid workouts and return `rejected` instead of failing the whole batch; store `rpe_source` (athlete or device) | #21 review | With phone sync |
| Workouts: resting HR from the check-in baseline; database checks for HR, distance, kcal | #21 review | Next workouts PR |
| Walking, alpine skiing and yoga are left out of the training-load summary – product owner to confirm | #21 review | Product decision |
| Store review for health data: App Store privacy policy and health-data consent (guidelines 5.1.2(i), 5.1.3); Google Play Health Connect data declaration and rationale screen | ADR-0007 | Before store builds |
| Transactional outbox and a background worker for domain events; events are published after commit and nothing subscribes yet | expert review | With the first event subscriber |
| Privacy notice: food search terms and barcodes go from the apps directly to Open Food Facts (with the user's IP address, no account data); OFF data is ODbL and attributed in the UI | #33 | Before beta |
| Direct accounts: webhooks and background sync, revoking at the provider on disconnect, detecting the same weigh-in from Withings and a phone health store, a key rotation path (MultiFernet) | ADR-0008 | With WHOOP / Strava |
| Photos: scheduled purge of expired meal photos (now on the user's next upload), S3-compatible storage with pre-signed URLs, removing a user's photo files when account deletion exists, a per-user photo quota, one avatar per user enforced in the database | #36 | Before beta |
