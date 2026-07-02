import { useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, Receipt, PieChart, Settings, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { setPendingReceipt } from "@/lib/scanFile";
import { useReviews } from "@/api/hooks";

const TABS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/transactions", label: "Transactions", icon: Receipt, end: false },
  { to: "/insights", label: "Insights", icon: PieChart, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
] as const;

/**
 * Navigation shell — user-flow.md §0.
 * Phone: bottom tab bar + centered Scan FAB. Desktop: left sidebar (layout
 * responsive refinements land with the Phase 1 UI pass). The Scan FAB is the
 * single most important control and is reachable from every tab.
 */
export function AppShell() {
  const navigate = useNavigate();
  const scanInput = useRef<HTMLInputElement>(null);
  const reviews = useReviews();
  const reviewCount = reviews.data?.length ?? 0;

  function onCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (file) {
      setPendingReceipt(file);
      navigate("/scan");
    }
  }

  return (
    <div className="mx-auto flex h-full min-h-dvh w-full max-w-3xl flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-4">
        <Outlet />
      </main>

      {/* Scan FAB — opens the camera directly (user-flow §3): the tap is the user
          gesture that lets the capture input open the camera on mobile. */}
      <input
        ref={scanInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onCapture}
      />
      <button
        type="button"
        aria-label="Scan a receipt"
        onClick={() => scanInput.current?.click()}
        className="fixed bottom-16 left-1/2 z-20 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
      >
        <Camera className="h-6 w-6" />
      </button>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-background">
        <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "relative flex flex-col items-center gap-1 py-2 text-xs",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )
                }
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {to === "/" && reviewCount > 0 && (
                    <span
                      aria-label={`${reviewCount} need review`}
                      className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-none text-warning-foreground"
                    >
                      {reviewCount}
                    </span>
                  )}
                </span>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Global toasts — "Saved", "3 transactions synced", etc. (user-flow §0). */}
      <Toaster position="top-center" richColors />
    </div>
  );
}
