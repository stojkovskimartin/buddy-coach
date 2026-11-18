# Buddy Coach – mobile app (iOS and Android)

Expo SDK 58 (React Native 0.88), TypeScript, the shared typed client `@buddy/api-client`.

## Screens

- **Login / register** – same password rule as the API (at least 12 characters).
- **Today** – main goal with countdown, other goals, pull to refresh, log out.
- **Coach** – chat with the coach network; one-tap suggestions, specialist label,
  safety escalations and failed calls shown as alerts.

Profile setup and new goals are done in the web app for now; the guided mobile onboarding is
tracked as P-05.

## Run it on your phone

1. Start the API (`docker compose -f infra/docker-compose.yml up --build` in the repo root).
2. Install **Expo Go** from the App Store or Google Play.
3. Find your computer's address on the Wi-Fi (Windows: `ipconfig`, "IPv4 Address"; macOS:
   `ipconfig getifaddr en0`), for example `192.168.1.20`.
4. Create `apps/mobile/.env` with:

   ```
   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:8000
   ```

   Android emulator: `http://10.0.2.2:8000`. iOS simulator: `http://localhost:8000`.
5. In the repo root: `pnpm install`, then `pnpm --filter @buddy/mobile start` and scan the QR
   code with the camera (iOS) or Expo Go (Android). Phone and computer must be on the same Wi-Fi;
   allow port 8000 in the Windows firewall if the phone cannot connect.

## Security

- Tokens live in the iOS Keychain / Android Keystore via `expo-secure-store`, readable only while
  the device is unlocked and never restored to another device (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`,
  Android backup of secure-store data disabled).
- No health data is stored on the device yet. When it is, it must be encrypted (AGENTS.md).
- `EXPO_PUBLIC_*` values are bundled into the app: never put secrets there.

## Tests

```bash
pnpm --filter @buddy/mobile test        # Jest (jest-expo) + React Native Testing Library
pnpm --filter @buddy/mobile typecheck
```
