# ADR-0007: Phone health stores as the first device source

- Status: accepted
- Date: 2026-11-19

## Context

Athletes use Apple Watch, Garmin, Fitbit, Samsung, WHOOP, Huawei, Xiaomi and others. Most of these
apps write finished workouts to the phone's health store: Apple Health on iPhone, Health Connect
on Android. Vendor cloud APIs (WHOOP, Garmin, Google Health, Huawei) each need a developer
agreement, OAuth and webhooks, and some are gated (Garmin).

## Decision

- The mobile app reads workouts and heart rate from Apple Health
  (`@kingstinct/react-native-healthkit`) and Health Connect (`react-native-health-connect`; on
  Android also distance and active calories, which Health Connect keeps as separate records) and
  sends them to `POST /workouts/import` with source `apple_health` / `health_connect`.
- Body weight from smart scales (Withings, Eufy, Renpho, Xiaomi, Garmin, ...) comes the same way:
  HealthKit `HKQuantityTypeIdentifierBodyMass` / Health Connect `Weight`, with its own cursor, sent
  to `POST /body/weights/import` (added later; implausible readings are skipped by the server).
  Phones connected before weights were read are offered an "Allow weight" step. Readings deleted
  in the phone's store are not mirrored; they are deleted in the app.
- Read only: no write access to either store, no background-delivery entitlement.
- Sync runs in the foreground (app opened, "Sync now"). Incremental via the HealthKit anchor and
  the Health Connect changes token, saved on the phone only after the server accepted the batch.
  First sync: the last 30 days (Health Connect's limit for data written before access).
- Both stores sit behind one `HealthSource` interface; native modules load lazily, so Expo Go
  still runs every other screen. Health sync needs a development build.
- Cloud APIs follow later per vendor, for devices that do not write to the phone store.

## Consequences

- One mobile feature covers most watches on day one; no vendor accounts are needed.
- Known limits: no background sync yet; deletions in the store are not mirrored (the API deletes by
  its own id only); the same run written by two apps (e.g. Apple Watch and Garmin) arrives twice
  until server-side de-duplication across sources exists; heart rate, distance or calories that
  an app writes to Health Connect after its session was synced are not picked up (changes are
  tracked for exercise sessions only).
- Store review: the App Store needs a privacy policy and the health-data rules of guideline 5.1.3,
  and explicit consent before data is shared with an AI provider (5.1.2(i)); Google Play needs a
  Health Connect data declaration. Tracked in `docs/backlog.md`.
