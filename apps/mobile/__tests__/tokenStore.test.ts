import { hasStoredSession, secureTokenStore, TOKEN_KEY } from "../src/lib/tokenStore";

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
