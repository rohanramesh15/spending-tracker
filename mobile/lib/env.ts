/**
 * Environment for the Expo app.
 *
 * Expo exposes only variables prefixed EXPO_PUBLIC_ to the client bundle, and inlines them at
 * build time — so they must be referenced as full static property accesses
 * (`process.env.EXPO_PUBLIC_X`), never destructured or computed, or the inlining silently
 * yields undefined.
 *
 * These are the native counterparts of the web app's VITE_* vars. Nothing secret belongs
 * here: the Supabase publishable key is public by design, and every real secret stays in SSM
 * behind the backend (CLAUDE.md #11).
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

/** Local-dev escape hatch mirroring the web's VITE_AUTH_DEV_BYPASS. Never set in a real build. */
export const AUTH_DEV_BYPASS = process.env.EXPO_PUBLIC_AUTH_DEV_BYPASS === "true";

/**
 * Whether Supabase credentials are actually present.
 *
 * They can't be committed (they're per-environment and live in the deploy dashboard), so a
 * fresh checkout has none. `createClient` THROWS on an empty URL, which otherwise takes the
 * whole app down with "supabaseUrl is required" plus a misleading ErrorBoundary cascade — an
 * unreadable failure for what is just a missing .env.local. We therefore fall back to a
 * syntactically valid placeholder and let the UI report the real problem (see login.tsx).
 *
 * Anything requiring a session is unusable in this state, by design; screens that don't need
 * one still run, which keeps UI work possible without credentials.
 */
export const IS_SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/** Never reached by a real request — it exists only to stop createClient throwing. */
export const SUPABASE_URL_OR_PLACEHOLDER = SUPABASE_URL || "https://placeholder.supabase.co";
export const SUPABASE_KEY_OR_PLACEHOLDER = SUPABASE_PUBLISHABLE_KEY || "placeholder-anon-key";

if (!IS_SUPABASE_CONFIGURED) {
  console.warn(
    "Supabase env not set (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY). " +
      "Copy mobile/.env.example to mobile/.env.local and fill it in. Sign-in is disabled until then.",
  );
}
