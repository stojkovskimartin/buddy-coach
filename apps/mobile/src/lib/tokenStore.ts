/**
 * Session tokens in the operating system's secure storage (iOS Keychain, Android Keystore).
 * Tokens never go to AsyncStorage or plain files.
 */
import type { TokenPair, TokenStore } from "@buddy/api-client";
import * as SecureStore from "expo-secure-store";

export const TOKEN_KEY = "buddy-coach.tokens";

/** Readable only while the device is unlocked, and never restored to another device. */
function options(store: typeof SecureStore): SecureStore.SecureStoreOptions {
  return { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
}

export function secureTokenStore(store: typeof SecureStore = SecureStore): TokenStore {
  const OPTIONS = options(store);
  return {
    get: async () => {
      const raw = await store.getItemAsync(TOKEN_KEY, OPTIONS);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as TokenPair;
      } catch {
        await store.deleteItemAsync(TOKEN_KEY, OPTIONS);
        return null;
      }
    },
    set: async (tokens) => {
      if (tokens) await store.setItemAsync(TOKEN_KEY, JSON.stringify(tokens), OPTIONS);
      else await store.deleteItemAsync(TOKEN_KEY, OPTIONS);
    },
  };
}

/** True when a session was stored earlier, so the app can skip the login screen on start. */
export async function hasStoredSession(store: typeof SecureStore = SecureStore): Promise<boolean> {
  return (await store.getItemAsync(TOKEN_KEY, options(store))) !== null;
}
