// The safe-area provider renders nothing until native insets arrive; tests use fixed insets.
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
