import "@testing-library/jest-dom/vitest";

// Node 25+ has its own experimental `localStorage` (undefined without --localstorage-file) that
// hides jsdom's. Put jsdom's back so the tests see the browser's storage on every Node version.
declare const jsdom: { window: Window } | undefined;
if (typeof jsdom !== "undefined" && !globalThis.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: jsdom.window.localStorage,
  });
}
