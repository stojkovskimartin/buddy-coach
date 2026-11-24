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
| WHOOP: edits to workouts older than 7 days and deleted workouts are not mirrored (no "changed since" in the API); recovery and sleep for the check-in | #44 | With webhooks |
| Direct accounts: webhooks and background sync, revoking at the provider on disconnect, detecting the same weigh-in from Withings and a phone health store, a key rotation path (MultiFernet) | ADR-0008 | With WHOOP / Strava |
| Photos: scheduled purge of expired meal photos (now on the user's next upload), S3-compatible storage with pre-signed URLs, removing a user's photo files when account deletion exists, a per-user photo quota, one avatar per user enforced in the database | #36 | Before beta |
| Tests: `BUDDY_*` variables set in the shell (or `uv run --env-file .env pytest`) still reach `Settings` in tests; only the `.env` file is shut out | #50 review | When it bites |
| `BUDDY_ENVIRONMENT` defaults to `development`: a deployment that forgets it would accept development-only settings such as `BUDDY_FAKE_PROVIDERS`; require it outside local runs | #51 review | Free hosting |
| Web: the browser bar colour (`theme-color`) follows the device, not a theme chosen in the app | #52 review | With Settings |
| Web: the dashboard's "Recent days" range and the check-in's "Not now" use the device's day; the server's "today" follows the profile's time zone, so a device in another zone can be a day off | #53 review | With Settings (time zone) |
| Coach: router keywords in Macedonian (Macedonian questions go to the Head Coach); a native speaker reviews the Macedonian safety patterns and replies | #54 review | With the Macedonian UI |
| Safety Guard: dose patterns are slow on very long runs of digits (5,000 digits take seconds; already so before #54); cap the checked length or bound the number patterns | #54 review | Before public launch |
| Macedonian: the reasons under today's food targets come from the server in English; send codes and translate them in the apps. Product names from Open Food Facts stay as the database has them | #55 | With the target engine's next change |
| Web: an error or status message already on screen stays in the old language after switching; the next one uses the new language | #55 review | When it bites |
| Phone: Macedonian dates use Intl `mk-MK`, which Hermes on Android may lack; check or fall back to month names from the catalog in the phone PR | #55 review | Languages on the phone |
| Shared web/mobile wording (goal types, coach agents, errors) into @buddy/shared | #56 review | Next i18n change |
