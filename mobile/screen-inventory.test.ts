import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * SCREEN + COMPONENT INVENTORY GUARD — the mobile counterpart of
 * backend/tests/test_route_inventory.py, and it works the same way: it FAILS when a screen or
 * component exists with no test and isn't in the shrink-only backlog below.
 *
 * Why this file exists
 * -------------------
 * CLAUDE.md requires every feature to ship its regression tests in the same commit. That rule
 * was followed for steps 1–9 and then quietly broken for steps 10 and 11: four screens and the
 * Plaid integration landed with zero tests, the suite still passed, and "done" was reported.
 * A passing suite is not evidence when nothing exercises the new code.
 *
 * Exhortation doesn't prevent that; a failing build does. So: adding a screen without a test
 * now breaks CI. The only escape is KNOWN_UNTESTED, which may only ever SHRINK — a reviewer can
 * see it grow in the diff.
 *
 * When you add a test for something here, delete its entry. Never add one to make CI pass.
 */

const MOBILE_ROOT = __dirname;

/**
 * Files that legitimately need no test of their own.
 * Keep this list about *kinds* of files, not specific features.
 */
const EXEMPT = [
  // Config and tooling, exercised by every other test simply by running.
  "tamagui.config.ts",
  "metro.config.js",
  "babel.config.js",
  "jest.config.js",
  "jest.setup.js",
  "test-utils.tsx",
  "screen-inventory.test.ts",
  // Pure re-export barrels have no behaviour to pin.
  "components/ui/index.ts",
  // Environment reading — a test would assert that process.env works.
  "lib/env.ts",
  // Thin platform bindings: the logic they wrap is tested in shared/, and what's left is a
  // library call that can only be verified on a device.
  "lib/supabase.ts",
  "lib/queryPersistence.ts",
  // Navigation/layout shells: structure only, covered by the screens they host.
  "app/_layout.tsx",
  "app/(tabs)/_layout.tsx",
  "app/+not-found.tsx",
  // Presentational-only helpers with no branching.
  "components/GoogleIcon.tsx",
  "components/ScreenPlaceholder.tsx",
  "components/useColorScheme.ts",
  "components/useColorScheme.web.ts",
  "components/ui/Card.tsx",
  "components/ui/Screen.tsx",
];

/**
 * SHRINK-ONLY BACKLOG. Everything here is untested and shouldn't be.
 *
 * Do not add to this list to make the build pass — write the test instead. Each entry names
 * what is actually at risk, so the cost of leaving it is visible.
 */
const KNOWN_UNTESTED: Record<string, string> = {
  // Requires a dev build and Plaid Sandbox credentials to exercise meaningfully; the flow
  // cannot run in Jest because the SDK is native. Worth a mocked test of the token/exchange
  // sequencing, which is pure orchestration.
  "components/PlaidLink.tsx": "native SDK; needs mocked session test of token→exchange ordering",
  // Auth gating is effect-driven and depends on expo-router segments; needs a router harness.
  "components/AuthGate.tsx": "needs an expo-router harness to assert redirect + cache wipe",
  "lib/useAuth.ts": "PKCE flow needs mocked WebBrowser/Linking",
  // Screens below are covered only by their extracted logic modules, not their rendering.
  "app/login.tsx": "renders the sign-in button; flow itself is unverified pending credentials",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip `jest.mock("…")` targets before looking for real imports.
 *
 * Without this, mocking a module counts as covering it — the exact inverse of the truth, and a
 * loophole that would let anyone silence this guard by stubbing the thing they didn't test.
 * (Caught by the guard's own staleness check: settings.test.tsx mocks PlaidLink and useAuth.)
 */
function stripMocks(source: string): string {
  return source.replace(/jest\.mock\(\s*["'][^"']+["']/g, "");
}

/** A source file is "covered" if a sibling *.test.* exists, or a test file genuinely imports it. */
function hasTest(relPath: string, allFiles: string[], testSources: string[]): boolean {
  const withoutExt = relPath.replace(/\.(ts|tsx)$/, "");

  const siblingTest = allFiles.some((f) => {
    const r = relative(MOBILE_ROOT, f);
    return r === `${withoutExt}.test.ts` || r === `${withoutExt}.test.tsx`;
  });
  if (siblingTest) return true;

  // Screens keep their logic in lib/ modules; count a test that imports the module by path.
  const importPath = `@/${withoutExt}`;
  return testSources.some((src) => stripMocks(src).includes(importPath));
}

describe("screen + component inventory", () => {
  const allFiles = walk(MOBILE_ROOT);
  const sourceFiles = allFiles
    .map((f) => relative(MOBILE_ROOT, f))
    .filter((r) => !/\.test\.(ts|tsx)$/.test(r))
    .filter((r) => r.startsWith("app/") || r.startsWith("components/") || r.startsWith("lib/"))
    .filter((r) => !EXEMPT.includes(r))
    .sort();

  const testSources = allFiles
    .filter((f) => /\.test\.(ts|tsx)$/.test(f))
    .map((f) => readFileSync(f, "utf8"));

  it("finds source files to check (guard is actually wired up)", () => {
    // If a refactor moves these directories, the guard must fail loudly rather than pass by
    // silently checking nothing.
    expect(sourceFiles.length).toBeGreaterThan(10);
  });

  it("has a test for every screen and component", () => {
    const untested = sourceFiles.filter((r) => !hasTest(r, allFiles, testSources));
    const unexpected = untested.filter((r) => !(r in KNOWN_UNTESTED));

    expect(unexpected).toEqual([]);
  });

  it("keeps the untested backlog shrink-only", () => {
    // An entry that no longer needs to be here means someone wrote the test but left the
    // exemption behind — the next untested file would then slip in unnoticed under its name.
    const stale = Object.keys(KNOWN_UNTESTED).filter(
      (r) => !sourceFiles.includes(r) || hasTest(r, allFiles, testSources),
    );

    expect(stale).toEqual([]);
  });
});
