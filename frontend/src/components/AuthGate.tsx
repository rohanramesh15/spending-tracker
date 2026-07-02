import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/useAuth";

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
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
