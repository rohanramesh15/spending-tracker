/**
 * Jest for the Expo app. Vitest (used by frontend/) does not apply to React Native — the
 * preset is what wires up the RN runtime, Babel transform, and asset mocks.
 *
 * shared/ is covered by frontend's vitest run, so it's deliberately NOT collected here; the
 * moduleNameMapper below only exists so mobile components can import from it.
 */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@shared/(.*)$": "<rootDir>/../shared/$1",
    "^@/(.*)$": "<rootDir>/$1",
  },
  // The RN ecosystem ships untranspiled ESM; these must go through Babel.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@tamagui/.*|tamagui|@gorhom/.*))",
  ],
  collectCoverageFrom: ["components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "!**/*.d.ts"],
};
