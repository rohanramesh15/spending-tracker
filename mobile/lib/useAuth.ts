import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { supabase } from "@/lib/supabase";

/** Reactive Supabase session state for auth-gating and the login UI. Mirrors the web hook. */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

/**
 * Where Google sends the user back to. `Linking.createURL` yields the app's own scheme
 * (trackit://auth/callback in a build, exp://…/--/auth/callback under Expo Go).
 *
 * BOTH forms must be in the Supabase Auth redirect allowlist or the provider rejects the
 * round trip — see docs/expo-conversion-plan.md §4. This is a human-only dashboard step.
 */
export function authRedirectUrl(): string {
  return Linking.createURL("auth/callback");
}

export class SignInCancelled extends Error {
  constructor() {
    super("Sign-in was cancelled.");
    this.name = "SignInCancelled";
  }
}

/**
 * Google sign-in on native, via PKCE.
 *
 * The web app can hand the whole redirect to the browser and let `detectSessionInUrl` pick the
 * session back up. Native has no such thing, so each leg is explicit:
 *   1. ask Supabase for the provider URL (skipBrowserRedirect — we open it ourselves),
 *   2. open it in an auth session (a system browser sheet that can return to our scheme),
 *   3. pull the PKCE `code` off the redirect URL,
 *   4. exchange it for a session, which supabase-js then persists to AsyncStorage.
 *
 * Runs in Expo Go. The native account-picker upgrade (@react-native-google-signin +
 * signInWithIdToken) needs a dev build and is deliberately deferred — see §4.
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = authRedirectUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("Supabase did not return a provider URL.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  // "cancel"/"dismiss" mean the user backed out — not an error worth shouting about.
  if (result.type !== "success") throw new SignInCancelled();

  const { params, errorCode } = Linking.parse(result.url) as unknown as {
    params: Record<string, string> | null;
    errorCode: string | null;
  };
  if (errorCode) throw new Error(errorCode);

  // Supabase reports provider-side failures as query params rather than a thrown error.
  const providerError = params?.error_description ?? params?.error;
  if (providerError) throw new Error(providerError);

  const code = params?.code;
  if (!code) throw new Error("No authorization code was returned.");

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
