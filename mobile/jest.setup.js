/* eslint-env jest */

// AsyncStorage has no native module under Jest; the official mock stands in for it.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// expo-router pulls in native navigation state we don't want in unit tests. Component tests
// that need routing should mock the specific hook they use.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  Link: "Link",
  Stack: { Screen: "Stack.Screen" },
  Tabs: { Screen: "Tabs.Screen" },
}));
