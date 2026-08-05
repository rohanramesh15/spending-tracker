import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { configureAuth } from "@shared/api/client";
import { SUPABASE_KEY_OR_PLACEHOLDER, SUPABASE_URL_OR_PLACEHOLDER } from "@/lib/env";

/**
 * Supabase client — AUTH ONLY (Google OAuth + session/JWT).
 *
 * Native counterpart of frontend/src/lib/supabase.ts. Same contract: this app never queries
 * the database directly (no `supabase.from(...)`); all data flows through the FastAPI backend,
 * which verifies the JWT and applies RLS per request. supabase-js only manages the session and
 * hands us the access token to forward as a Bearer header.
 *
 * Three settings differ from web, and all three are required on React Native:
 *  - `storage: AsyncStorage` — there is no localStorage.
 *  - `detectSessionInUrl: false` — there is no URL bar to read the redirect back from. The
 *    session is established explicitly in signInWithGoogle() instead.
 *  - `flowType: "pkce"` — the implicit flow puts tokens in a URL fragment, which a mobile
 *    redirect can't safely carry. PKCE returns a short-lived code we exchange ourselves.
 */
export const supabase = createClient(SUPABASE_URL_OR_PLACEHOLDER, SUPABASE_KEY_OR_PLACEHOLDER, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

/**
 * React Native has no page lifecycle, so supabase-js can't tell when the app is backgrounded.
 * Left alone its refresh timer keeps firing while suspended — burning battery and producing
 * failed refreshes. Drive it from AppState instead: refresh while active, stop otherwise.
 */
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});

// Cache the current access token so the (sync) API client can attach it as a Bearer header.
// Kept fresh by onAuthStateChange (login, logout, silent refresh).
let accessToken: string | null = null;

function setSession(session: Session | null) {
  accessToken = session?.access_token ?? null;
}

void supabase.auth.getSession().then(({ data }) => setSession(data.session));
supabase.auth.onAuthStateChange((_event, session) => setSession(session));

// Tell the shared FastAPI client how to read the current JWT.
configureAuth(() => accessToken);
