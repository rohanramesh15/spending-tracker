import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/useAuth";
import { Skeleton, ChartSkeleton, ListSkeleton } from "@/components/Skeletons";

/**
 * Gate for authenticated routes (user-flow §0: "All screens work logged-in only;
 * an expired session bounces to Login preserving the intended destination").
 */
export function AuthGate() {
  const { session, loading } = useAuth();
  const location = useLocation();

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
