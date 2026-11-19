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
  SdkAvailabilityStatus: { SDK_UNAVAILABLE: 1 },
  getSdkStatus: async () => 1,
}));
