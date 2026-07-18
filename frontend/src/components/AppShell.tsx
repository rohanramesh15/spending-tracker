import { useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Home, Receipt, PiggyBank, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { setPendingReceipt } from "@/lib/scanFile";
import { useReviews, useNotifications } from "@/api/hooks";

// Bottom tabs. "Scan" isn't a route — it opens the camera directly (replacing the old
// floating FAB), so the single most important control lives in the nav itself.
const TABS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/transactions", label: "Transactions", icon: Receipt, end: false },
  { scan: true, label: "Scan", icon: Camera },
  { to: "/earn", label: "Earn", icon: PiggyBank, end: false },
] as const;

/**
 * Navigation shell — user-flow.md §0.
 * Phone: bottom tab bar. Desktop: same bar (responsive refinements later). The Scan tab
 * opens the camera directly — the tap is the user gesture the capture input needs on mobile.
 */
export function AppShell() {
  const navigate = useNavigate();
  const scanInput = useRef<HTMLInputElement>(null);
  const reviews = useReviews();
  const reviewCount = reviews.data?.length ?? 0;
  const alerts = useNotifications(true); // unread subscription alerts → badge on the Agents tab
  const alertCount = alerts.data?.length ?? 0;

  // Per-tab badge count (0 = no badge).
  const badgeFor = (to?: string) =>
    to === "/" ? reviewCount : to === "/earn" ? alertCount : 0;

  function onCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (file) {
      setPendingReceipt(file);
      navigate("/scan");
    }
  }

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative flex w-full flex-col items-center gap-1 py-2 text-xs",
      isActive ? "text-primary" : "text-muted-foreground",
    );

  return (
    <div className="mx-auto flex h-full min-h-dvh w-full max-w-3xl flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        <Outlet />
      </main>

      {/* Hidden capture input the Scan tab triggers (opens the camera on mobile). */}
      <input
        ref={scanInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onCapture}
      />

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-background">
        <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <li key={tab.label} className="flex-1">
                {"scan" in tab ? (
                  <button
                    type="button"
                    aria-label="Scan a receipt"
                    onClick={() => scanInput.current?.click()}
                    className="flex w-full flex-col items-center gap-1 py-2 text-xs text-muted-foreground"
                  >
                    <Icon className="h-5 w-5" />
                    {tab.label}
                  </button>
                ) : (
                  <NavLink to={tab.to} end={tab.end} className={tabClass}>
                    <span className="relative">
                      <Icon className="h-5 w-5" />
                      {badgeFor(tab.to) > 0 && (
                        <span
                          aria-label={`${badgeFor(tab.to)} alerts`}
                          className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-none text-warning-foreground"
                        >
                          {badgeFor(tab.to)}
                        </span>
                      )}
                    </span>
                    {tab.label}
                  </NavLink>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Global toasts — "Saved", "Synced", etc. (user-flow §0). */}
      <Toaster position="top-center" richColors />
    </div>
  );
}
