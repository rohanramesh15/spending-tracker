# Expo Conversion Plan

Status: **in progress** — started 2026-08-03, branch `expo/shared-extraction` off `convert-codebase-expo`.

This document is the authoritative plan for converting the web frontend to a React Native
app on Expo. It sits alongside `docs/implementation-plan.md` (architecture, phases) and
`docs/user-flow.md` (screens and states); where this file describes *how the mobile client
is built*, those two still own *what it does*. If they disagree, they win — flag it.

---

## 1. Goal and end state

Build a native iOS app in Expo that is a feature-complete replacement for the existing
Vite SPA, in the same repository.

- **During transition:** `frontend/` (web) and `mobile/` (Expo) both exist and both work.
- **End state:** the web app is **retired**. `mobile/` is the only client. `shared/` folds
  back into `mobile/` and disappears.

Because the web app is explicitly temporary, this plan deliberately does *not* invest in a
durable two-platform abstraction. `shared/` is a transition scaffold with no compatibility
guarantees, not a long-lived published package.

### Decisions locked with the user (2026-08-03)

| Decision | Choice | Rationale |
|---|---|---|
| Repo layout | `mobile/` + `shared/` as sibling dirs at repo root | No monorepo exists (see §2); avoids restructuring a working deploy |
| Styling | **Tamagui** | Web is disposable, so Tailwind-parity (NativeWind's main benefit) has no long-term value |
| Design fidelity | **Native-first redesign** | Same features and data, laid out the way a native app should be — not a translated web layout |
| Web app | Keep working during transition, retire after | User intends to be mobile-only |
| Auth | **Google OAuth** (already in use) | Corrects the stale "magic link" line in CLAUDE.md |

### Explicit non-goals

- No backend, `infra/`, SAM, or Supabase schema changes. The Expo app is a new client for
  the *same* Lambda Function URL, same JWT, same RLS. If this conversion appears to require
  a backend change, stop and re-examine — it almost certainly doesn't.
- No change to `website/` (the TrackIt marketing site).
- No Android work until iOS is done. (Nothing here blocks it; it's just not the goal.)
- Phase 5 (cheaper-store finder) stays gated by its existing precondition in CLAUDE.md.

---

## 2. Repository layout (and a correction)

**Important discovery:** this repo is *not* a pnpm monorepo. There is no root
`package.json`. `frontend/pnpm-workspace.yaml` exists but only carries build-script
approvals (`allowBuilds: esbuild`), not a `packages:` list. `frontend/` is a standalone
pnpm project with its own lockfile.

An earlier version of this plan said "add `mobile/` to the pnpm workspace." That was wrong.
Establishing a root workspace would mean re-pointing the Cloudflare Pages build, the CI
workflows, and the lockfile — real risk to a working production deploy, in exchange for a
convenience we only need until the web app is retired.

**Therefore:** `shared/` is a plain directory at the repo root, consumed by path alias, with
no package-manager involvement.

```
spending-tracker/
├── backend/          unchanged
├── infra/            unchanged
├── website/          unchanged
├── docs/             + this file
├── shared/           NEW — framework-agnostic TS, consumed by alias (transitional)
│   ├── api/          client.ts, types.ts, hooks.ts
│   └── lib/          dates.ts, categories.ts, money.ts, queryPersistence.ts
├── frontend/         existing Vite SPA — imports shared/ via Vite alias + tsconfig paths
└── mobile/           NEW — Expo app, imports shared/ via Metro watchFolders + resolver
```

Both `frontend/` and `mobile/` are **standalone pnpm projects**, each with its own lockfile and
its own `pnpm-workspace.yaml` acting as a workspace boundary (see §7.1 — without it, pnpm
adopts the user's home directory as the workspace root and installs nothing).

Each consuming app installs the shared code's runtime deps itself (`date-fns`,
`@tanstack/react-query`). That is normal and expected for the alias pattern.

**Alias wiring:**
- `frontend/`: `vite.config.ts` `resolve.alias` `"@shared" -> ../shared`, plus
  `tsconfig.app.json` `paths`. The existing `"@/*" -> ./src/*` alias is untouched.
- `mobile/`: `metro.config.js` `watchFolders: [../shared]` (Metro refuses to resolve files
  outside the project root without this — it is the single most common failure mode of this
  layout) plus `extraNodeModules` and a matching `tsconfig` path.

---

## 3. What is shared, shimmed, and rewritten

The frontend is 64 files / ~6,000 lines. It divides into three groups.

### 3a. Shared as-is (~1,300 lines, no DOM dependency)

| File | Note |
|---|---|
| `api/types.ts` | Pure type declarations. Moves untouched. |
| `api/hooks.ts` | TanStack Query is platform-agnostic. Moves untouched. |
| `api/client.ts` | **One change:** drop `import.meta.env.VITE_API_BASE_URL` for an injected `configureApi({ baseUrl })`. Metro does not support `import.meta.env`. |
| `lib/dates.ts` | `date-fns` only. Moves untouched. Its local-calendar-date discipline (CLAUDE.md #2) is exactly what must not be re-implemented per-platform. |
| `lib/categories.ts` | Color/label constants + lookups. Moves untouched. The palette was validated for contrast and CVD; **do not re-pick colors for native.** |
| `lib/money.ts` | **New file:** `formatCents`, `dollarsToCents`, `centsToInput`, split out of `lib/utils.ts`. Money is integer cents (CLAUDE.md #1) — this logic must exist exactly once. |

`formatCents` uses `Intl.NumberFormat`, which Hermes supports only when built with full ICU.
Expo SDK ships full ICU on iOS, so this works — but it is a known Hermes/Android footgun
and is called out in §8 as a thing to verify, not assume.

### 3b. Split — pure part shared, platform part per-app

| File | Shared part | Per-app part |
|---|---|---|
| `lib/queryPersistence.ts` | `trimOldTransactions`, `QUERY_CACHE_BUSTER`, `QUERY_CACHE_MAX_AGE`, and a `createQueryPersister(storage)` factory | Web passes `window.localStorage`; mobile passes `AsyncStorage`. The 6-month transaction trim is real logic worth sharing. |
| `lib/utils.ts` | `formatCents`/`dollarsToCents`/`centsToInput` → `shared/lib/money.ts` | `cn()` (clsx + tailwind-merge) stays **web-only** in `frontend/src/lib/utils.ts`. Tamagui has no use for it. |

### 3c. Stays per-app (deliberate duplication)

`lib/supabase.ts` and `lib/useAuth.ts` are ~70 lines combined and are the files that must
diverge most (env access, session storage, OAuth redirect handling). Sharing them would
require a client-injection layer whose only beneficiary is an app being deleted. Duplicate
them.

### 3d. Full rewrite (~4,000 lines)

Every `.tsx` file. Not because the logic is wrong, but because every `<div>`, every
Tailwind class, and every Radix primitive is DOM-bound.

| Web | Native replacement | Notes |
|---|---|---|
| `components/ui/*` (shadcn + Radix) | Tamagui primitives | See §5. Rebuilt, not translated. |
| `react-router-dom` + `AppShell` | `expo-router` + tab navigator | File-based routes mirror current paths |
| `SpendingPie` (Recharts) | `victory-native` or hand-rolled `react-native-svg` | The **hatch fills** (Tip 45°, Uncategorized 135°) are SVG `<pattern>` defs — these carry real meaning (CVD-safe separation of same-hue slices) and must survive the port |
| `DateRangePicker` + `ui/calendar` (react-day-picker) | `react-native-calendars` or native picker | Presets in `shared/lib/dates.ts` are reused as-is |
| `ScanPage` file input | `expo-image-picker` / `expo-camera` | *Improves* on web — real camera capture |
| `PlaidLink` (react-plaid-link) | `react-native-plaid-link-sdk` | **Requires dev build** — see §6 |
| `@vis.gl/react-google-maps` | `react-native-maps` | **Requires dev build** |
| `sonner` toasts | Tamagui `Toast` | |
| `next-themes` | Tamagui theme provider | Light/dark already has a designed dark palette in `categories.ts` |

---

## 4. Authentication (Google OAuth on native)

**This is the highest-risk item and everything else is blocked on it.** It is also the item
most likely to be wrong in any generic Expo guide, because the web and native flows differ.

Today the web app calls `supabase.auth.signInWithOAuth({ provider: "google", options: {
redirectTo: window.location.origin } })` and relies on `detectSessionInUrl` to pick the
session up off the redirect. Neither `window.location` nor URL detection exists on native.

### Chosen approach: PKCE + `expo-web-browser` (works in Expo Go)

```
supabase client:  flowType: "pkce"
                  detectSessionInUrl: false
                  storage: AsyncStorage
                  autoRefreshToken gated by an AppState listener
                  (RN has no page lifecycle; without this the refresh timer
                   runs in the background and burns battery / fails silently)

sign-in:  1. signInWithOAuth({ provider: "google",
                               redirectTo: Linking.createURL("auth/callback"),
                               skipBrowserRedirect: true })   -> returns { url }
          2. WebBrowser.openAuthSessionAsync(url, redirectUri)
          3. parse `code` from the returned URL
          4. supabase.auth.exchangeCodeForSession(code)
```

Chosen because it runs in **Expo Go**, so auth is provable before the EAS dev build exists
(§6). The trade-off is a browser sheet rather than the native account picker.

**Deferred upgrade (fold into §6, once a dev build exists):**
`@react-native-google-signin/google-signin` → `supabase.auth.signInWithIdToken({ provider:
"google", token })`. This gives the true native account picker and no browser chrome, but
needs a custom dev build *and* iOS/Android OAuth client IDs in Google Cloud. Not worth
blocking the port on.

### Human-only steps (cannot be faked — CLAUDE.md)

1. Add the app's redirect URLs to the **Supabase Auth allowlist**: the `exp://` dev URL and
   the production scheme (e.g. `trackit://auth/callback`).
2. For the deferred native-picker upgrade only: create iOS/Android OAuth client IDs in
   Google Cloud.

### Must carry over from `AuthGate`

The cache-wipe-on-different-user logic is a **privacy control**, not a nicety: if a second
Google account signs in on the same device, it must never see the first account's cached
financial data. The web version keys this on `localStorage`; the native version keys it on
AsyncStorage. Port it deliberately, and test it (§8).

The `VITE_AUTH_DEV_BYPASS` escape hatch should carry over as an Expo env equivalent, with
the same "never in production builds" discipline.

---

## 5. Tamagui design system

Native-first, per the locked decision. Build the token/theme layer **before** any screen —
everything else depends on it.

- **Tokens:** colors, space, size, radius, typography. Category colors come from
  `shared/lib/categories.ts` (already contrast- and CVD-validated) — reference them, don't
  redefine them.
- **Themes:** light + dark, using the existing `CATEGORY_COLORS` / `CATEGORY_COLORS_DARK`
  pairs.
- **Primitives to build:** `Button`, `Input`, `Label`, `Select`, `Card`, `Row`, `Sheet`
  (`@gorhom/bottom-sheet`), `Dialog` (RN `Modal`), `Toast`, `Skeleton`.
- The web `ui/table.tsx` has **no native equivalent** — transactions become a `FlatList` of
  rows, which is the correct native form and a good example of "redesign, not translate."

Tamagui's compiler needs a babel plugin and `tamagui.config.ts`; expect setup friction here
and budget for it rather than being surprised.

---

## 6. EAS dev build (the Expo Go cliff)

`react-native-plaid-link-sdk` and `react-native-maps` both contain native code, so from
this point the app **cannot run in Expo Go** — it needs a custom dev client built via EAS.

This is sequenced late on purpose: everything up to it (auth, design system, all screens
except bank-link and maps) is provable in Expo Go with a fast edit-reload loop. Crossing
this line early would slow every subsequent iteration for no benefit.

Constraints that still apply from CLAUDE.md:
- Plaid work stays in **Sandbox**. Real accounts are linked once, at the very end — the
  trial plan has a **10-Item lifetime cap**, so burning Items on mobile testing is
  permanent damage.
- Maps/Places keys are already provisioned for Phase 5; no new AWS cost.

---

## 6a. Definition of done for a conversion step — READ BEFORE CLAIMING ANY STEP COMPLETE

This section exists because it was learned the hard way. Steps 10 and 11 were reported done
while shipping **zero tests**; the suite passed identically before and after (82 tests either
way) because nothing exercised the new code. Settings also shipped two **fake features** —
"Import CSV" and "Export CSV" rows that called `toast.success("… coming soon")`, looking
implemented, doing nothing, and reporting success for a non-action.

A step is done only when **all** of these are true. Verify them; do not assume them.

1. **Every new screen and component has a test.** Enforced by `mobile/screen-inventory.test.ts`,
   which fails the build otherwise. The only escape is its `KNOWN_UNTESTED` backlog, which may
   only ever SHRINK. Never add an entry to make the build pass.
2. **The tests actually exercise the new code.** A green suite proves nothing if the test count
   didn't move. Note the before/after count. Mocking a module does **not** cover it — the guard
   strips `jest.mock()` targets specifically to close that loophole.
3. **No placeholder pretending to be a feature.** A control that renders but does nothing is
   worse than an absent one: it reads as complete. If something isn't built, either leave it out
   or label it visibly unavailable (see Earn's "SOON" cards). Never report success for a no-op.
4. **No invented scope.** Port what the web app does. "Export CSV" was never a web feature.
5. **All four states exist**, not just the happy path: loading, empty, error-with-recovery, and
   the populated case (user-flow §10, CLAUDE.md definition of done).
6. **`pnpm typecheck` and `pnpm test` pass in `mobile/`, and `npx expo export --platform ios`
   succeeds.** The export is not redundant: it catches Metro resolution breakage — especially
   anything touching the out-of-root `shared/` — that neither tsc nor Jest can see. **Actually run
   it.** It was claimed green in two consecutive entries while being red (see the 2026-08-03
   blockList entry): adding a test file under `app/` broke the bundle without touching a single
   thing tsc or Jest looks at, which is precisely the class of failure this check exists to catch.
7. **The web app is still green** if `shared/` was touched: `pnpm lint && pnpm test && pnpm build`
   in `frontend/`. The baseline is 57 passed / 3 failed; those 3 are pre-existing (see §7.1).
8. **Nothing outside the client changed.** `backend/`, `infra/`, and `website/` are out of scope.
   A deleted `backend/.env.example` was found in the working tree during step 11 — that kind of
   stray change must be caught before committing, not after.
9. **The work is committed and §7 status + the change log below are updated in the same commit.**
   An uncommitted step is a step that does not survive a context reset.

CI enforces 1, 2, 6 and 7. The rest need a human or agent to actually look.

---

## 7. Execution order and status

**This section is the handoff record. Any agent picking this work up should read §7.1 first,
then start at the first unchecked step. Update it in the same commit as the work.**

Each step must be independently green before the next starts.

**🎯 CURRENT FOCUS: Step 11 (native dev build verification) — Plaid code and EAS configuration
are complete; a signed-in Expo account plus mobile runtime env are now the remaining blockers.**

| # | Step | Status | Blocked by | Provable in Expo Go? |
|---|---|---|---|---|
| 1 | Extract `shared/`, repoint `frontend/`, prove web still green | **[x] DONE** | — | n/a (web) |
| 2 | Expo scaffold: Tamagui config, expo-router, tab nav | **[x] DONE** | 1 | yes |
| 3 | **Google OAuth (PKCE) end-to-end on device** | **[~] CODE COMPLETE — blocked on credentials** | 2 | yes |
| 4 | Tamagui primitives (§5) | **[x] DONE** | 2 | yes |
| 5 | RN query persistence (AsyncStorage) + `apiUpload` FormData shape | **[x] DONE** | 1, 2 | yes |
| 6 | Home + spending pie + date range | **[x] DONE** | 4, 5 | yes |
| 7 | Transactions list + detail + row/sheet/edit/delete | **[x] DONE** | 6 | yes |
| 8 | Manual entry + receipt scan (camera) | **[x] DONE** | 4, 5 | yes |
| 9 | Review queue + reconcile dialog | **[x] DONE** | 7 | yes |
| 10 | Earn / Subscriptions / Rewards / Settings | **[x] DONE** (tests backfilled; see §6a) | 7 | yes |
| 11 | EAS dev build → Plaid + maps | **[~] CODE COMPLETE — blocked on EAS credentials; needs a real dev build to verify** | 10 | **no** |
| 12 | Mobile test suite + docs | **[x] DONE** — 174 tests, screen-inventory guard, CI job | all | — |

### 7.1 Current state of the world (as of 2026-08-03)

**Branch:** `expo/shared-extraction`, off `convert-codebase-expo`. Not yet PR'd.
**Steps 1-10 are done and verified.** `mobile/` exists, builds, and runs on the iOS
simulator with all core functionality implemented. Step 11's native wiring is in place; its
development-build and live-Sandbox proof remain human-gated.

#### Step 11 — native Plaid implementation + development-build setup

`mobile/components/PlaidLink.tsx` now owns the two supported native flows using the current
`react-native-plaid-link-sdk` v13 session API: a freshly minted backend Link token opens the
connect flow and exchanges the returned short-lived public token; an update token opens the
existing account's reconnect/manage flow and then runs the server-side re-sync. The mobile app
never sees a Plaid secret or access token. `app/settings.tsx` displays connected accounts,
connect/reconnect/manage actions, and manual sync instead of the former placeholders.

`expo-dev-client`, `react-native-plaid-link-sdk`, and `react-native-maps` are installed, and
`mobile/eas.json` defines the internal `development` profile. `expo config --type prebuild`
confirms Plaid autolinking and the development client are included. `react-native-maps` currently
uses Expo's legacy unversioned config plugin; that is acceptable while no Finder map is rendered,
but re-check it when the Finder returns rather than treating the dependency alone as map support.

**Human steps to finish Step 11:**

1. Fill `mobile/.env.local` with the three `EXPO_PUBLIC_*` values from §Step 3. The backend
   `.env` has server credentials only; it cannot substitute for the Supabase URL, publishable key,
   or API base URL the native bundle needs.
2. Sign in to the intended Expo account (`npx eas-cli@latest login`) and run
   `npx eas-cli@latest build --profile development --platform ios` from `mobile/`; install the
   generated internal build on the simulator/device, then launch Metro with
   `npx expo start --dev-client`.
3. In the Plaid Dashboard, register `com.rohanramesh.trackit` and any OAuth redirect URI used by
   the deployed backend before testing a real institution. Use **Sandbox only** for this step;
   do not consume a real-bank Item.
4. The backend's `GOOGLE_PLACES_API_KEY` stays server-only. When the Finder/map feature is restored,
   create a separately restricted Maps SDK key for the iOS bundle (and Android package/SHA-1 if
   Android is added), expose it only to app config at build time, and rebuild. Do not reuse the
   Places server key in `EXPO_PUBLIC_*`.

#### Step 2 — what `mobile/` is right now

Expo SDK 57 / React Native 0.86 / React 19.2, created with `create-expo-app --template tabs`,
then stripped of template boilerplate.

- **Routing:** `expo-router`, file-based. `app/(tabs)/` holds `index` (Home), `transactions`,
  `scan`, `earn` — the same four tabs as the web `AppShell`. Non-tab routes (settings, review,
  transaction detail, manual entry) are **not created yet**; add them as their screens land.
- **Screens are placeholders.** `components/ScreenPlaceholder.tsx` renders "not ported yet"
  plus the step that will replace it. `app/(tabs)/index.tsx` is the exception — it renders a
  deliberate **shared/ smoke test** (formatCents, rangePresets/formatRangeLabel, categoryColor).
  Keep that smoke test until the real Home screen replaces it in step 6; it is what makes a
  shared-wiring regression fail loudly and immediately.
- **Providers** (`app/_layout.tsx`): `TamaguiProvider` → `PersistQueryClientProvider` →
  `SafeAreaProvider` → `Stack`. `configureApi({ baseUrl: API_BASE_URL })` is called at module
  load, before any request can fire — mirroring `frontend/src/main.tsx`.
- **Env:** `mobile/lib/env.ts` + `mobile/.env.example`. Expo only exposes `EXPO_PUBLIC_*` and
  inlines it at build time, so it must be referenced as a full static property access
  (`process.env.EXPO_PUBLIC_X`) — destructuring or computing the key silently yields undefined.
- **Query persistence:** `mobile/lib/queryPersistence.ts` injects AsyncStorage into the shared
  factory. This is the persistence half of step 5, done early because `_layout.tsx` needs it.
  **Step 5 still owes the `apiUpload` FormData shape for React Native file objects.**
- **Auth gating does not exist yet.** The tabs render unguarded. Step 3 adds it, and must also
  port AuthGate's cache-wipe-on-different-user privacy control (§4).

#### Step 3 — auth is written and gating is verified; the OAuth round trip is NOT

All the code exists and the app runs, but **the actual Google sign-in has never been executed**
because no Supabase credentials are available in this environment. Do not mark step 3 fully
done until someone completes the human steps below and signs in on a device.

Files:
- `lib/supabase.ts` — client with AsyncStorage, `flowType: "pkce"`, `detectSessionInUrl: false`,
  and an **AppState-driven auto-refresh** (RN has no page lifecycle; without this the refresh
  timer keeps firing while suspended). Wires the JWT into the shared API client via `configureAuth`.
- `lib/useAuth.ts` — `useAuth()`, `signInWithGoogle()`, `signOut()`, `authRedirectUrl()`.
  The PKCE flow is explicit: get provider URL (`skipBrowserRedirect`) → `WebBrowser.
  openAuthSessionAsync` → parse `code` → `exchangeCodeForSession`. A user backing out throws
  `SignInCancelled`, which the UI treats as normal rather than as an error.
- `components/AuthGate.tsx` — `useProtectedRoute` (segment-driven redirect; expo-router has no
  `<Navigate>` equivalent) plus `useCacheIsolation`, the **ported privacy control**: wipe the
  in-memory and persisted cache when the signed-in user changes, so one Google account can never
  see another's cached financial data on the same device. Keyed on AsyncStorage here, localStorage on web.
- `app/login.tsx` + `components/GoogleIcon.tsx` — the login screen.
- `app/_layout.tsx` — `RootNavigator` registers both route groups and lets `useProtectedRoute`
  decide which is permitted, rather than changing the tree shape under the router.

**Missing-config behaviour is deliberate.** `createClient` throws on an empty URL, which took the
whole app down with an unreadable ErrorBoundary cascade. `lib/env.ts` now exports
`IS_SUPABASE_CONFIGURED` and falls back to a syntactically valid placeholder, so the app boots,
the login screen renders, and it states exactly what's missing. This keeps later UI steps
workable without credentials.

**HUMAN STEPS required to finish step 3** (CLAUDE.md: only the human can do these):
1. Create `mobile/.env.local` from `mobile/.env.example` with the real
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
   `EXPO_PUBLIC_API_BASE_URL`. These are not committed anywhere in the repo — the web app's
   live values come from the Cloudflare Pages dashboard.
2. Add the app's redirect URLs to the **Supabase Auth redirect allowlist**: the Expo Go dev URL
   (`exp://<lan-ip>:8081/--/auth/callback`) and the built-app scheme (`trackit://auth/callback`).
   Both forms matter; Expo Go and a real build produce different URLs.
3. Sign in on a device/simulator and confirm the round trip completes.

Then also verify the privacy control, which is the easiest thing here to get quietly wrong:
sign in as one Google account, sign out, sign in as a second, and confirm the first account's
cached data is gone rather than briefly visible.

#### Step 4 — design system and the mobile test suite

`components/ui/` (import via the `components/ui/index.ts` barrel, not the individual files):
`Screen`, `Card`, `Field` + `TextField`, `Skeleton`/`ChartSkeleton`/`ListSkeleton`,
`EmptyState`/`ErrorState`, `AppSheet` + `SheetRow`, `ConfirmDialog`. Plus `components/CategoryChip.tsx`.

`EmptyState`/`ErrorState`/the skeletons exist as first-class primitives because user-flow §10 and
CLAUDE.md's definition of done require those states on every screen; putting them in the design
system stops each screen re-improvising them.

**The test suite was pulled forward from step 12** into this step, because CLAUDE.md requires
tests to ship in the same commit as the feature. `jest-expo` + `@testing-library/react-native`,
run with `pnpm test` from `mobile/`. `test-utils.tsx` wraps renders in `TamaguiProvider`.
19 tests currently pass. Step 12 now only owes CI wiring and the screen-level tests that arrive
with each screen.

Four traps worth knowing before writing more mobile tests:

1. **Jest must be v29, not v30.** `jest-expo` pulls `jest-environment-jsdom@29`; mixing it with
   jest 30 fails every suite at startup with
   `this._moduleMocker.clearMocksOnScope is not a function`.
2. **RTL v14 made `render`, `rerender`, `unmount` and every `fireEvent` helper async.** Forgetting
   an `await` doesn't throw — it leaves `screen` unpopulated and every query fails with the
   misleading **"`render` function has not been called"**. If you see that error, you forgot an await.
3. **`accessibilityRole` alone is not queryable.** RN elements also need `accessible` before
   `getByRole` (or a screen reader) can see them.
4. **React Native has no "invalid" accessibility state**, unlike `aria-invalid` on the web. Invalid
   inputs are styled visually; the spoken cue comes from `Field`'s `accessibilityRole="alert"` text.

**Known gap:** `AppSheet` and `ConfirmDialog` have no `animation` prop. The drivers are configured
via `createAnimations` and work at runtime, but spreading Tamagui's v4 preset into `createTamagui`
loses the animation-key types, so `animation="medium"` fails to typecheck; augmenting both
`tamagui` and `@tamagui/core` did not help. Sheets and dialogs currently open without a spring.
Tracked as follow-up — likely needs the config built without the preset spread, or a version bump.

#### Step 2 — install-layout gotchas (these cost real time; read before touching deps)

1. **`mobile/pnpm-workspace.yaml` is a workspace BOUNDARY, not decoration.** There is a pnpm
   workspace at the user's **home directory** (`~/pnpm-workspace.yaml` + `~/package.json`).
   Without a boundary file, pnpm walks up, adopts `$HOME` as the root, and `pnpm install`
   reports success while installing **nothing**. `frontend/` has one for exactly this reason —
   that is its real purpose, not just the `allowBuilds` it also carries. Do not delete either.
2. **`nodeLinker: hoisted` is required**, and in pnpm 11 it belongs in `pnpm-workspace.yaml`
   (an `.npmrc` `node-linker=hoisted` was silently ignored). Metro does not understand pnpm's
   isolated symlink layout: transitive packages re-exported by a dependency (`@tamagui/core`
   behind `tamagui`, `babel-preset-expo` behind `expo`) fail to resolve. The symptom is
   "Unable to resolve module X" that looks like an app bug but is an install-layout bug.
3. **`babel-preset-expo` is an explicit devDependency.** Once you write your own
   `babel.config.js` it stops being purely transitive.
4. **The TanStack packages are pinned to one build in `metro.config.js`.** They each declare
   both `"react-native": "src/index.ts"` and an `exports` map to `build/modern/index.js`. Metro
   honours the react-native field for app imports but the exports map for imports made from
   inside another package, so `@tanstack/react-query` loaded twice under two file paths — two
   module instances, two React contexts. `PersistQueryClientProvider` published a client
   `useQueryClient` could not see, and every screen died with **"No QueryClient set, use
   QueryClientProvider to set one"** despite correct-looking nesting. `resolver.resolveRequest`
   forces one concrete file per package. If a TanStack upgrade changes that layout, this error
   is the symptom. Also: do **not** reintroduce a catch-all `extraNodeModules` Proxy — it
   bypasses `exports`/`react-native` resolution and causes the same class of bug.
5. **Tamagui config deviates from the v4 preset in two deliberate ways** (`tamagui.config.ts`,
   both commented): `onlyAllowShorthands: false` so screens can use `alignItems`/`padding`
   rather than only `ai`/`p`, and `allowedStyleValues: false` so the arbitrary-hex category
   palette can be applied without a cast at every chip and pie slice.

#### Verification status

**Step 1** (`cd frontend`): `pnpm lint` clean · `pnpm build` green · `pnpm test` **57 passed,
3 failed (60)**.

**Step 2** (`cd mobile`):
- `npx tsc --noEmit` — clean.
- `npx expo export --platform ios` — green, 5.2MB Hermes bundle. This is the check that proves
  Metro resolves out-of-root `shared/`.
- **Ran on the iOS simulator (iPhone 17 Pro, Expo Go 57) and rendered correctly.** Confirmed
  on-device: the four-tab bar; `formatCents(123456)` → `$1,234.56`; the date range
  `Aug 1 – Aug 31, 2026`; the category palette with `Uncategorized` → "Not itemized".
- **§8.1 Hermes/`Intl` risk is RESOLVED for iOS** — `Intl.NumberFormat` formats correctly under
  Hermes on this SDK. Re-check if Android is ever targeted; that was always the riskier platform.

To run it yourself: `cd mobile && npx expo start`, then open `exp://127.0.0.1:8081` on a booted
simulator. Note `expo start --ios` may fail with a `simctl openurl` timeout on a cold-booted
simulator; launching Expo Go first (`xcrun simctl launch <udid> host.exp.Exponent`) and then
opening the URL works reliably.

#### Pre-existing failures — do not mistake these for regressions

The 3 failures are all in `frontend/src/components/DateRangePicker.test.tsx` and are
**pre-existing on `main`, not caused by this work** — verified by running that file on a clean
checkout before the refactor: identical 3 failed / 4 passed. They look date-sensitive.
The green baseline to compare against is exactly these 3, in this file. Fixing or quarantining
them is tracked follow-up, because an ambiguous baseline undermines every later step.

**What step 1 actually changed:**

- Created `shared/` at the repo root:
  - `shared/api/client.ts` — moved from `frontend/src/api/`. **Behavior change:** no longer
    reads `import.meta.env`; exports `configureApi({ baseUrl })`, which each app must call
    once at startup *before any request*. Web calls it in `frontend/src/main.tsx`.
  - `shared/api/hooks.ts`, `shared/api/types.ts` — moved verbatim.
  - `shared/lib/dates.ts`, `shared/lib/categories.ts` (+ its test) — moved verbatim.
  - `shared/lib/money.ts` — **new file**, holding `formatCents` / `dollarsToCents` /
    `centsToInput` split out of the old `frontend/src/lib/utils.ts`. Tested by
    `shared/lib/money.test.ts` (the former `utils.test.ts`).
  - `shared/lib/queryPersistence.ts` — the pure logic (`trimOldTransactions`, cache buster,
    max age) plus a `createQueryPersister(storage)` factory and a
    `clearPersistedCache(queryClient, persister)` that now takes the persister as an argument.
    Declares its own `QueryStorage` structural type — the persister package does **not**
    export an `AsyncStorage` type in this version, so don't try to import one.
- `frontend/src/lib/utils.ts` now contains **only** `cn()`. It stays web-only; Tamagui has
  no use for it. Do not add anything to it.
- `frontend/src/lib/queryPersistence.ts` is now a thin web binding that injects
  `window.localStorage` and re-exports the same public API as before, so no frontend call
  site changed. **`mobile/` needs the equivalent file injecting AsyncStorage — that is
  step 5, and it is the only thing step 5 owes on the persistence side.**
- Import rewrites across `frontend/src`: `@/api/*` → `@shared/api/*`, `@/lib/dates` and
  `@/lib/categories` → `@shared/lib/*`, money helpers → `@shared/lib/money`. `@/lib/utils`
  now appears only for `cn`.
- `CLAUDE.md`: corrected "Auth (magic link, JWT)" → "Auth (Google OAuth, JWT)".

**Resolution wiring — read this before doing step 2, it will save you an hour.**
`shared/` sits *above* `frontend/node_modules`, and Node resolves `node_modules` by walking up
from the importing file. So bare specifiers inside `shared/` do not resolve on their own.
Three places had to be taught this, and Metro will need the same treatment:

1. `frontend/vite.config.ts` — `resolve.alias` is in **array form with anchored regexes**, not
   the object map. This matters: a prefix alias like `"@tanstack"` also swallows *transitive*
   packages (`@tanstack/query-persist-client-core`) that pnpm keeps in `.pnpm` rather than in
   `frontend/node_modules`, and the production build fails with a `vite:load-fallback` ENOENT.
   Only exact specifiers `shared/` imports are aliased.
2. `frontend/vite.config.ts` — `server.fs.allow` includes the repo root, or Vite refuses to
   serve files outside the app root and the shared tests fail to load.
3. `frontend/tsconfig.app.json` — `include` gains `"../shared"`, and `paths` mirrors the
   runtime aliases so `tsc -b` agrees with the bundler.
4. `frontend/vite.config.ts` — `test.include` was widened to pick up `../shared/**/*.test.ts`.

For `mobile/`, the equivalent is `metro.config.js`: `watchFolders: [<repo>/shared]` **and**
`resolver.extraNodeModules` mapping shared's bare deps to `mobile/node_modules`. Metro fails
loudly on out-of-root files without `watchFolders`; this is the single most common failure
mode of this layout.

(Verification for both steps is consolidated under "Verification status" above.)

---

## 8. Testing (CLAUDE.md makes this non-negotiable)

The regression rule applies to this work: **every feature ships with its tests in the same
commit/PR**, and the full suite runs locally before any push.

- **`shared/`**: the existing pure-logic tests (`utils.test.ts`, `categories.test.ts`,
  `dates`-related assertions in `DateRangePicker.test.tsx`, `queryPersistence.test.ts`)
  move with the code they cover. These are the highest-value tests in the frontend and must
  not be lost in the move.
- **`mobile/`**: component/flow tests rewritten against `@testing-library/react-native` +
  Jest (`jest-expo`). Vitest does not apply to RN.
- **`frontend/`**: must stay green throughout the transition. `pnpm lint && pnpm test &&
  pnpm build` after step 1, and after any later change that touches `shared/`.
- **Backend**: untouched, so the route-inventory guard and RLS smoke test are unaffected —
  but they still must pass before any deploy.

Specific things to pin with tests, because they are easy to silently break in a port:
1. `formatCents` under Hermes (the `Intl` concern in §3a) — assert real formatted output on
   device, not just in Jest under Node.
2. Local-date handling (`parseISODate`) — a UTC regression renders a day early and is
   invisible in a UTC-ish timezone.
3. The AuthGate cache-wipe-on-user-change privacy control (§4).
4. The chart aggregation rule (CLAUDE.md #6) — itemized charts line items + tax + tip,
   unitemized charts total under Uncategorized, `needs_review` excluded.
5. Idempotent ingest and never-auto-merge semantics survive the new client.

**Never hit real Gemini / Plaid / Kroger / Places in a test.**

---

## 9. Known risks

| Risk | Mitigation |
|---|---|
| Native Google OAuth is the blocking unknown | Do it at step 3, on a real device, before building 12 screens on an unproven assumption |
| Metro cannot resolve `shared/` outside the project root | `watchFolders` + `extraNodeModules`; validated at step 2 before it can block anything |
| `Intl`/Hermes formatting differences | Explicit on-device assertion (§8.1) |
| Tamagui compiler/babel setup friction | Budgeted at step 2; not on the critical path for auth |
| Plaid Item lifetime cap (10) | Sandbox only until the very end; never link real accounts for testing |
| Two UIs drifting during transition | `shared/` holds all non-UI logic; web is frozen feature-wise once mobile catches up |
| Web retirement leaves dead code | Tracked explicitly: delete `frontend/`, fold `shared/` into `mobile/`, update CI + Pages deploy |

---

## 10. Change log

- **2026-08-03** — Plan created. Decisions locked: Tamagui, native-first redesign, keep-then-retire
  web, `shared/` as an aliased root directory (not a workspace package). Corrected two errors
  found while reading the code: (a) the repo is not a pnpm monorepo, (b) auth is Google OAuth,
  not magic link — `CLAUDE.md`'s "Auth (magic link, JWT)" line was fixed in the same change.
- **2026-08-03** — **Step 1 complete** (branch `expo/shared-extraction`). `shared/` extracted,
  `frontend/` repointed, web verified green (lint clean, build green, 57/60 tests — the 3
  failures pre-existing, see §7.1). `configureApi` replaces `import.meta.env` in the shared API
  client; money helpers split into `shared/lib/money.ts`; query persistence split into shared
  logic + a per-app storage binding. Resolution wiring for out-of-root `shared/` documented in
  §7.1 — Metro will need the same treatment in step 2. Next: step 2, Expo scaffold.
- **2026-08-03** — **Step 2 complete.** `mobile/` scaffolded on Expo SDK 57 / RN 0.86 / React 19
  with expo-router (four tabs matching the web shell), Tamagui, TanStack Query + AsyncStorage
  persistence, and env plumbing. Verified by typecheck, `expo export`, and an actual run on the
  iOS simulator. Two install-layout traps found and documented in §7.1: the home-directory pnpm
  workspace requires a boundary file, and Metro requires `nodeLinker: hoisted`. The Hermes
  `Intl` risk (§8.1) is resolved for iOS — `formatCents` renders `$1,234.56` on device.
  Next: step 3, native Google OAuth, which gates every screen after it.
- **2026-08-03** — **Step 3 code complete, blocked on credentials.** PKCE Google sign-in,
  AppState-driven token refresh, segment-based route protection, and the ported
  cache-wipe-on-user-change privacy control are all written; the login screen and redirect are
  verified on the simulator. The OAuth round trip itself is **unverified** — no Supabase
  credentials exist in this environment. See the human steps in §7.1. Found and fixed a Metro
  module-identity bug (TanStack dual builds → "No QueryClient set"), documented in §7.1.
  Missing config now degrades to a clear on-screen message instead of crashing the app.
- **2026-08-03** — **Step 4 complete.** Tamagui design-system primitives built (Screen, Card,
  Field, Skeletons, Empty/Error states, AppSheet, ConfirmDialog, CategoryChip). The mobile test
  suite was pulled forward from step 12 to satisfy CLAUDE.md's "tests ship with the feature"
  rule: jest-expo + @testing-library/react-native, 19 tests passing, typecheck clean. Four
  RN-testing traps documented in §7.1 (jest 29 vs 30, RTL v14's async render, `accessible`
  needed for role queries, no RN "invalid" a11y state). One known gap: Sheet/Dialog animation
  props removed pending a Tamagui type fix.
- **2026-08-03** — **Steps 5-10 complete.** RN query persistence with AsyncStorage + 
  `apiUpload` FormData shape for React Native file objects implemented. All core screens built:
  Home (SpendingPie + DateRangePicker), Transactions list/detail/action sheet, Manual entry,
  Receipt scan with camera, Review queue + reconcile dialog, Earn hub, Subscriptions management,
  Rewards optimizer display, and **Settings screen** with sign out, data management placeholders,
  and version info. TypeScript fixes applied: `total_missed_cents` → `total_missed_annual_cents`
  in rewards, `SubscriptionStatus` updated to match backend enum. Mobile test suite: 12 suites,
  82 tests passing. TypeScript compilation clean across both apps.
- **2026-08-03** — **Step 11 code complete; build verification pending.** Added the Expo SDK 57
  development client, Plaid Link v13 native SDK, and `react-native-maps`; created the internal
  EAS development profile. Settings now presents native Plaid connect/update Link sessions,
  server-side exchange/re-sync, connected-account status, and manual sync. `pnpm typecheck`,
  all 82 mobile tests, `expo config --type prebuild`, and the iOS Metro export are green. EAS is
  not authenticated in this environment and the mobile public runtime config has not been supplied,
  so no development build or live Sandbox Link session has been attempted. The backend `.env` was
  detected and deliberately not copied into mobile because it contains server-only secrets.

- **2026-08-03** — **Steps 10–12 audited and repaired.** Steps 10 and 11 had been reported
  complete while shipping zero tests (the suite sat at 82 before and after), and Settings
  contained two fake features that reported success for a no-op. Added
  `mobile/screen-inventory.test.ts` — the mobile counterpart of the backend route-inventory
  guard — which fails the build when a screen or component has no test; it flagged 15 files
  immediately, and caught a loophole in itself (it had been counting `jest.mock()` as coverage).
  Backfilled tests: **82 → 174 across 28 suites**. Wired a `mobile` CI job (typecheck, test,
  `expo export`) and added `shared/**` to both clients' path filters, since the mobile tests had
  never run on a PR. Replaced the fake CSV rows with the real Apple Card import, removed the
  invented "Export CSV", fixed "1 transaction need review", and restored a stray-deleted
  `backend/.env.example`. §6a now states the definition of done that was missing.
  Remaining: on-device verification of steps 3 and 11, which needs your credentials and an EAS
  build; plus the two tracked follow-ups (web DateRangePicker failures, Tamagui animation props).

- **2026-08-03** — **`KNOWN_UNTESTED` emptied, and a red `expo export` found and fixed.**
  All four remaining backlog entries were closed: `lib/useAuth.ts` (10 tests — the PKCE legs in
  order, cancel-is-not-an-error, provider errors arriving as query params, missing code, failed
  exchange, plus the session listener and its unsubscribe), `components/AuthGate.tsx` (9 — route
  protection in both directions, the loading and dev-bypass guards, and the
  cache-wipe-on-user-change **privacy control** in all four of its cases),
  `components/PlaidLink.tsx` (9 — connect exchanges the public token, update **must not** and
  re-syncs instead, and every failure path clears `busy`), and `app/login.tsx` (5 — the four
  states plus the unconfigured-Supabase notice). **174 → 207 tests across 32 suites.**
  Each entry had been justified by "it needs a device"; that only ever justified skipping the
  device leg, not the orchestration around it, which is where the risk actually lived. The two
  highest-value assertions were mutation-checked (breaking the cache wipe and making the update
  flow exchange a token each fail exactly one test), because a backlog closed by vacuous tests is
  worse than the backlog.

  **`npx expo export --platform ios` was already failing on this branch** — DoD item 6 and the
  entry above both claim it green, so it broke when screen tests were colocated under `app/`
  during the step 10–12 audit and was not re-run. expo-router builds its route table from
  `require.context(app/, true, …)` whose regex has no test-file exclusion, so `app/*.test.tsx`
  was loaded as a route, pulled in @testing-library/react-native, and died on its `require("console")`.
  Fixed with a `resolver.blockList` in `metro.config.js` that excludes our own `*.test.*`/`*.spec.*`
  from Metro (scoped away from `node_modules`, several of which legitimately ship such files).
  This also keeps test code and its dev-only deps out of the shipped bundle. The mobile CI job
  runs this same export, so CI was red too. Export now green (6.2MB Hermes bundle); typecheck
  clean; nothing outside `mobile/` touched, so `shared/` and the web app are unaffected.

  Noted while verifying: Jest's "a worker process has failed to exit gracefully" warning is
  **pre-existing** (it reproduces on the 174-test baseline), not introduced by these tests.

  Still remaining, unchanged: on-device verification of steps 3 and 11 (your credentials + an EAS
  build), and the two tracked follow-ups.
