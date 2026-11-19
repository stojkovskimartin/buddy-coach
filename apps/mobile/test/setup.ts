// The safe-area provider renders nothing until native insets arrive; tests use fixed insets.
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual("react-native-safe-area-context/jest/mock").default,
);

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Native health stores never load in tests; the health tests inject fake sources instead.
jest.mock("@kingstinct/react-native-healthkit", () => ({ isHealthDataAvailable: () => false }));
jest.mock("react-native-health-connect", () => ({
  // The real constants (plain values, no native code) keep the activity mapping honest.
  ...jest.requireActual("react-native-health-connect/lib/commonjs/constants"),
  getSdkStatus: async () => 1,
}));
