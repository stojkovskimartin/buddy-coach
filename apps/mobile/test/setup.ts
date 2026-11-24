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

// The camera never opens in tests: pressing the fake camera "scans" globalThis.fakeBarcode.
jest.mock("expo-camera", () => {
  const { Pressable } = jest.requireActual("react-native");
  const { createElement } = jest.requireActual("react");
  return {
    useCameraPermissions: jest.fn(() => [{ granted: true, canAskAgain: true }, jest.fn()]),
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned: (r: { data: string }) => void }) =>
      createElement(Pressable, {
        accessibilityRole: "button",
        accessibilityLabel: "Fake camera",
        onPress: () =>
          onBarcodeScanned({ data: (globalThis as { fakeBarcode?: string }).fakeBarcode ?? "4000417025005" }),
      }),
  };
});

// Taking and shrinking photos needs the phone; tests replace the whole adapter.
jest.mock("../src/lib/photos", () => ({
  pickPhoto: jest.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
  dataUri: jest.fn(async () => "data:image/jpeg;base64,AAAA"),
}));

// Tests run in English unless a test picks another device language.
jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [{ languageTag: "en-US", languageCode: "en" }]),
}));
