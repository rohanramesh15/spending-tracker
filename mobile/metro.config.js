// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");
const sharedRoot = path.resolve(repoRoot, "shared");

const config = getDefaultConfig(projectRoot);

// shared/ lives OUTSIDE this project root. Metro refuses to resolve files it isn't watching,
// so it must be listed explicitly — this is the single most common failure mode of the
// aliased-shared-directory layout (see docs/expo-conversion-plan.md §7.1).
config.watchFolders = [sharedRoot];

// ...and because shared/ sits above mobile/node_modules, Node's "walk up from the importing
// file" resolution finds nothing for its bare imports (date-fns, @tanstack/*). Adding this
// app's node_modules to the search path fixes that for every importer, including shared/.
// frontend/vite.config.ts does the equivalent via resolve.alias.
//
// Deliberately NOT using a catch-all `extraNodeModules` Proxy here. Mapping every bare
// specifier to a hard directory path bypasses package.json "exports"/"react-native"
// resolution, which let @tanstack/react-query load under two different module identities —
// the provider and useQueryClient then saw separate React contexts and every screen died with
// "No QueryClient set". nodeModulesPaths does the same job without rewriting resolution.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

/**
 * Keep test files out of the bundle.
 *
 * expo-router builds its route table from `require.context(app/, true, …)`, and that regex has
 * no notion of test files — so a colocated `app/login.test.tsx` gets pulled in as if it were a
 * route. It then drags @testing-library/react-native along, which requires Node's `console`
 * module, and `expo export` dies with "Unable to resolve module console".
 *
 * Blocking them here fixes the export and keeps test code (and its dev-only deps) out of the
 * shipped bundle, without giving up colocation. Jest doesn't read this config, so the tests
 * still run. `(?!node_modules/)` keeps this scoped to our own files — several dependencies
 * ship files named *.test.js that Metro must still be able to see.
 */
const escaped = projectRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = new RegExp(
  `^${escaped}/(?!node_modules/).*\\.(test|spec)\\.[jt]sx?$`,
);

// Tamagui ships its source as .mjs in places; keep the default source extensions plus mjs.
config.resolver.sourceExts = [...config.resolver.sourceExts, "mjs"];

/**
 * Pin the TanStack packages to a single build.
 *
 * Each of them declares BOTH `"react-native": "src/index.ts"` and an `exports` map pointing at
 * `build/modern/index.js`. Metro honours the react-native field for our direct imports but the
 * exports map for imports made from inside another package — so `@tanstack/react-query` loaded
 * twice under two file paths, i.e. two module instances with two separate React contexts.
 * PersistQueryClientProvider then published a client that useQueryClient could not see, and
 * every screen failed with "No QueryClient set, use QueryClientProvider to set one".
 *
 * Forcing one concrete file per package makes the identity unambiguous. If a TanStack upgrade
 * ever changes this layout, that error message is the symptom to look for.
 */
const PINNED_SINGLETONS = [
  "@tanstack/react-query",
  "@tanstack/react-query-persist-client",
  "@tanstack/query-async-storage-persister",
  "@tanstack/query-core",
  "@tanstack/query-persist-client-core",
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (PINNED_SINGLETONS.includes(moduleName)) {
    return {
      type: "sourceFile",
      filePath: path.resolve(projectRoot, "node_modules", moduleName, "build/modern/index.js"),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
