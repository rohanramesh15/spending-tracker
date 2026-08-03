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

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // Surface misconfiguration early rather than as confusing 401s later (matches the web client).
  console.warn(
    "Supabase env not set (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY).",
  );
}
