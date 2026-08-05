import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSegments } from "expo-router";

import { clearPersistedCache } from "@/lib/queryPersistence";

export const CACHE_USER_KEY = "spending-tracker-cache-user";

/** The route group that may be viewed signed-out. Everything else requires a session. */
const PUBLIC_SEGMENT = "login";

/**
 * PRIVACY CONTROL — do not remove or "simplify" this.
 *
 * The persisted query cache is per-device, not per-account. If a second Google account signs
 * in on this device, it must never see the first account's cached spending data. Wipe both the
 * in-memory and persisted cache whenever the signed-in user changes.
 *
 * Ported from the web AuthGate, where the same check keys on localStorage.
 */
function useCacheIsolation(session: Session | null, loading: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (loading || !session) return;
    let cancelled = false;

    void (async () => {
      const lastUserId = await AsyncStorage.getItem(CACHE_USER_KEY);
      if (cancelled) return;
      if (lastUserId && lastUserId !== session.user.id) {
        clearPersistedCache(queryClient);
      }
      await AsyncStorage.setItem(CACHE_USER_KEY, session.user.id);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, session, queryClient]);
}

/**
 * Redirects between the app and the login screen as the session changes.
 *
 * expo-router has no equivalent of the web's <Navigate> inside a route element, so the
 * canonical pattern is an effect driven by the current segments. Navigation must not run
 * before the router has mounted, hence the `loading` guard.
 */
export function useProtectedRoute(session: Session | null, loading: boolean, bypass: boolean) {
  const segments = useSegments();
  const router = useRouter();

  useCacheIsolation(session, loading);

  useEffect(() => {
    if (loading || bypass) return;

    const onPublicRoute = segments[0] === PUBLIC_SEGMENT;

    if (!session && !onPublicRoute) {
      router.replace("/login");
    } else if (session && onPublicRoute) {
      router.replace("/");
    }
  }, [session, loading, bypass, segments, router]);
}
