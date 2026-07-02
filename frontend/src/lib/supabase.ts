import { createClient, type Session } from "@supabase/supabase-js";
import { configureAuth } from "@/api/client";

/**
 * Supabase browser client — AUTH ONLY (magic-link login + session/JWT).
 *
 * Deliberately NOT the Next.js `@supabase/ssr` setup: this is a Vite SPA, so there are
 * no server components, cookies, or middleware. The SPA never queries the database
 * directly (no `supabase.from(...)`); all data flows through the FastAPI backend, which
 * verifies the JWT and applies RLS per request. supabase-js here only manages the login
 * session and hands us the access token to forward as a Bearer header.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY; // sb_publishable_… (public)

if (!url || !publishableKey) {
  // Surface misconfig early rather than as confusing 401s later.
  console.warn("Supabase env not set (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).");
}

export const supabase = createClient(url ?? "", publishableKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // handle the magic-link redirect
  },
});

// Cache the current access token so the (sync) API client can attach it as a Bearer
// header. Kept fresh by onAuthStateChange (login, logout, silent refresh).
let accessToken: string | null = null;

function setSession(session: Session | null) {
  accessToken = session?.access_token ?? null;
}

supabase.auth.getSession().then(({ data }) => setSession(data.session));
supabase.auth.onAuthStateChange((_event, session) => setSession(session));

// Tell the FastAPI client how to read the current JWT.
configureAuth(() => accessToken);
