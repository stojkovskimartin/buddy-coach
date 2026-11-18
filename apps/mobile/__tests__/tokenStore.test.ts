import {
  clearTokensAfterReinstall,
  hasStoredSession,
  INSTALL_FLAG_KEY,
  secureTokenStore,
  TOKEN_KEY,
} from "../src/lib/tokenStore";

function fakeSecureStore() {
  const data = new Map<string, string>();
  return {
    data,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
    getItemAsync: jest.fn(async (key: string) => data.get(key) ?? null),
    setItemAsync: jest.fn(
      async (key: string, value: string, _options?: { keychainAccessible?: number }) =>
        void data.set(key, value),
    ),
    deleteItemAsync: jest.fn(async (key: string) => void data.delete(key)),
  };
}

const tokens = { access_token: "a", refresh_token: "r", token_type: "bearer", expires_in: 900 };

describe("secureTokenStore", () => {
  it("saves, reads and clears tokens in secure storage", async () => {
    const store = fakeSecureStore();
    const tokenStore = secureTokenStore(store as never);

    await tokenStore.set(tokens as never);
    expect(JSON.parse(store.data.get(TOKEN_KEY)!)).toEqual(tokens);
    expect(await tokenStore.get()).toEqual(tokens);

    await tokenStore.set(null);
    expect(store.data.has(TOKEN_KEY)).toBe(false);
    expect(await tokenStore.get()).toBeNull();
  });

  it("only allows access while the device is unlocked, on this device only", async () => {
    const store = fakeSecureStore();
    await secureTokenStore(store as never).set(tokens as never);
    const options = store.setItemAsync.mock.calls[0]?.[2];
    expect(options?.keychainAccessible).toBe(store.WHEN_UNLOCKED_THIS_DEVICE_ONLY);
  });

  it("drops corrupt data instead of crashing", async () => {
    const store = fakeSecureStore();
    store.data.set(TOKEN_KEY, "{not json");
    expect(await secureTokenStore(store as never).get()).toBeNull();
    expect(store.data.has(TOKEN_KEY)).toBe(false);
  });

  it("reports whether a session was stored", async () => {
    const store = fakeSecureStore();
    expect(await hasStoredSession(store as never)).toBe(false);
    store.data.set(TOKEN_KEY, "{}");
    expect(await hasStoredSession(store as never)).toBe(true);
  });
});

describe("startup with the real storage modules", () => {
  function storage() {
    const secure = fakeSecureStore();
    const flags = new Map<string, string>();
    const asyncStorage = {
      getItem: jest.fn(async (k: string) => flags.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => void flags.set(k, v)),
    };
    return { secure, flags, asyncStorage };
  }

  it("deletes tokens left in the Keychain by an earlier install", async () => {
    const { secure, flags, asyncStorage } = storage();
    secure.data.set(TOKEN_KEY, "{}");
    await clearTokensAfterReinstall(secure as never, asyncStorage as never);
    expect(secure.data.has(TOKEN_KEY)).toBe(false);
    expect(flags.get(INSTALL_FLAG_KEY)).toBe("1");
  });

  it("keeps tokens on later starts", async () => {
    const { secure, flags, asyncStorage } = storage();
    flags.set(INSTALL_FLAG_KEY, "1");
    secure.data.set(TOKEN_KEY, "{}");
    await clearTokensAfterReinstall(secure as never, asyncStorage as never);
    expect(secure.data.has(TOKEN_KEY)).toBe(true);
  });

  it("restoreSession uses expo-secure-store and AsyncStorage", async () => {
    const { secure, flags, asyncStorage } = storage();
    jest.resetModules();
    jest.doMock("expo-secure-store", () => secure);
    jest.doMock("@react-native-async-storage/async-storage", () => ({
      __esModule: true,
      default: asyncStorage,
    }));
    const { restoreSession: restore } = require("../src/lib/tokenStore") as typeof import("../src/lib/tokenStore");

    expect(await restore()).toBe(false); // first start: nothing stored
    secure.data.set(TOKEN_KEY, "{}");
    expect(await restore()).toBe(true); // later start with a session
    expect(flags.get(INSTALL_FLAG_KEY)).toBe("1");
  });
});
