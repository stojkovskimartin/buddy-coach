/**
 * Session tokens in the operating system's secure storage (iOS Keychain, Android Keystore).
 * Tokens never go to AsyncStorage or plain files.
 */
import type { TokenPair, TokenStore } from "@buddy/api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export const TOKEN_KEY = "buddy-coach.tokens";
/** Non-secret marker in normal app storage, which is wiped on uninstall (unlike the Keychain). */
export const INSTALL_FLAG_KEY = "buddy-coach.installed";

type SecureStoreLike = Pick<
  typeof SecureStore,
  "getItemAsync" | "setItemAsync" | "deleteItemAsync" | "WHEN_UNLOCKED_THIS_DEVICE_ONLY"
>;
type FlagStore = Pick<typeof AsyncStorage, "getItem" | "setItem">;

/** Readable only while the device is unlocked, and never restored to another device. */
function options(store: SecureStoreLike): SecureStore.SecureStoreOptions {
  return { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
}

export function secureTokenStore(store: SecureStoreLike = SecureStore): TokenStore {
  const opts = options(store);
  return {
    get: async () => {
      const raw = await store.getItemAsync(TOKEN_KEY, opts);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as TokenPair;
      } catch {
        await store.deleteItemAsync(TOKEN_KEY, opts);
        return null;
      }
    },
    set: async (tokens) => {
      if (tokens) await store.setItemAsync(TOKEN_KEY, JSON.stringify(tokens), opts);
      else await store.deleteItemAsync(TOKEN_KEY, opts);
    },
  };
}

/**
 * iOS keeps Keychain items after the app is uninstalled. On the first start after an install,
 * tokens left over from an earlier install are deleted so a reinstall never logs in silently.
 */
export async function clearTokensAfterReinstall(
  store: SecureStoreLike = SecureStore,
  flags: FlagStore = AsyncStorage,
): Promise<void> {
  if (await flags.getItem(INSTALL_FLAG_KEY)) return;
  await store.deleteItemAsync(TOKEN_KEY, options(store));
  await flags.setItem(INSTALL_FLAG_KEY, "1");
}

/** True when a session was stored earlier, so the app can skip the login screen on start. */
export async function hasStoredSession(store: SecureStoreLike = SecureStore): Promise<boolean> {
  return (await store.getItemAsync(TOKEN_KEY, options(store))) !== null;
}

/** Startup check used by the app: clean up after a reinstall, then look for a session. */
export async function restoreSession(): Promise<boolean> {
  await clearTokensAfterReinstall();
  return hasStoredSession();
}
