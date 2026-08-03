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
// file" resolution finds nothing for its bare imports (date-fns, @tanstack/*). Point them at
// this app's install. frontend/vite.config.ts does the equivalent via resolve.alias, so both
// clients resolve shared/'s dependencies the same way.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(sharedRoot, "node_modules"),
];
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_target, name) => path.resolve(projectRoot, "node_modules", String(name)),
  },
);

// Tamagui ships its source as .mjs in places; keep the default source extensions plus mjs.
config.resolver.sourceExts = [...config.resolver.sourceExts, "mjs"];

module.exports = config;
