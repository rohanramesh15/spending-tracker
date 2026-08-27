import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Array form (not the object map) so every entry is an ANCHORED regex. A prefix alias like
  // "@tanstack" also swallows transitive packages such as @tanstack/query-persist-client-core,
  // which pnpm keeps in .pnpm rather than frontend/node_modules — that breaks the build.
  resolve: {
    alias: [
      { find: /^@\//, replacement: path.resolve(__dirname, "./src") + "/" },
      // Framework-agnostic code shared with the Expo app (see docs/expo-conversion-plan.md).
      // A plain aliased directory, not a workspace package — this repo has no root
      // package.json and restructuring package management under a live deploy isn't worth it.
      { find: /^@shared\//, replacement: path.resolve(__dirname, "../shared") + "/" },
      // shared/ lives ABOVE frontend/node_modules, and Node resolves node_modules by walking
      // up from the importing file — so bare specifiers inside shared/ don't resolve on their
      // own. Point the exact ones it imports at this app's install. The Expo app does the same
      // via Metro's extraNodeModules, so both clients resolve shared/'s deps the same way.
      { find: /^date-fns$/, replacement: path.resolve(__dirname, "node_modules/date-fns") },
      {
        find: /^@tanstack\/react-query$/,
        replacement: path.resolve(__dirname, "node_modules/@tanstack/react-query"),
      },
      {
        find: /^@tanstack\/query-async-storage-persister$/,
        replacement: path.resolve(
          __dirname,
          "node_modules/@tanstack/query-async-storage-persister",
        ),
      },
    ],
  },
  server: {
    port: 5173,
    // shared/ is outside this app's root; Vite refuses to serve such files unless allowed.
    fs: { allow: [path.resolve(__dirname, "..")] },
    proxy: {
      // Local dev: proxy API calls to the FastAPI dev server (uvicorn).
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Include shared/'s tests: they cover money, dates, categories and cache trimming —
    // the highest-value pure logic in the app. Until the Expo app has its own Jest suite,
    // the web run is what keeps them honest.
    include: ["src/**/*.{test,spec}.{ts,tsx}", "../shared/**/*.{test,spec}.{ts,tsx}"],
  },
});
