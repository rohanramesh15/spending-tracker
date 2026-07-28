import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/useAuth";
import { Skeleton, ChartSkeleton, ListSkeleton } from "@/components/Skeletons";
import { clearPersistedCache } from "@/lib/queryPersistence";

export const CACHE_USER_KEY = "spending-tracker-cache-user";

/**
 * Gate for authenticated routes (user-flow §0: "All screens work logged-in only;
 * an expired session bounces to Login preserving the intended destination").
 */
export function AuthGate() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  // localStorage is per-browser, not per-account — if a second Google account ever signs
  // into this app on the same device, it must never see the first account's cached spending
  // data. Wipe the persisted + in-memory cache when the signed-in user changes.
  useEffect(() => {
    if (loading || !session) return;
    const lastUserId = window.localStorage.getItem(CACHE_USER_KEY);
    if (lastUserId && lastUserId !== session.user.id) {
      clearPersistedCache(queryClient);
    }
    window.localStorage.setItem(CACHE_USER_KEY, session.user.id);
  }, [loading, session, queryClient]);

  // Local-dev escape hatch: skip auth so the app is drivable without a magic-link
  // email (pairs with the backend's AUTH_DEV_BYPASS). Off unless explicitly enabled;
  // never set in production builds.
  if (import.meta.env.VITE_AUTH_DEV_BYPASS === "true") {
    return <Outlet />;
  }

  if (loading) {
    // Mirror the Home layout (total → chart → list) so the load reads as the app filling in.
    return (
      <div className="mx-auto min-h-dvh w-full max-w-3xl space-y-6 px-4 pt-6">
        <Skeleton className="h-8 w-40" />
        <ChartSkeleton />
        <ListSkeleton rows={4} />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
