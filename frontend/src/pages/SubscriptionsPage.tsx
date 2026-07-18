import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, RefreshCw, Check, X, Ban, RotateCcw, Bell } from "lucide-react";
import {
  useSubscriptions,
  useRecomputeSubscriptions,
  useSetSubscriptionStatus,
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/api/hooks";
import type { Subscription, SubscriptionStatus, Cadence } from "@/api/types";
import { TotalSkeleton, ListSkeleton } from "@/components/Skeletons";
import { SubscriptionInsights } from "@/components/SubscriptionInsights";
import { Button } from "@/components/ui/button";
import { formatCents, cn } from "@/lib/utils";
import { parseISODate } from "@/lib/dates";

/**
 * Agents — automated insights from the user's spending. First agent: subscription detection
 * (docs/subscriptions-plan.md v1–v3). The list is persisted; the user confirms, dismisses, or
 * marks a sub cancelled, and a Rescan re-runs detection+enrichment (the only place the LLM
 * runs — never on plain reads).
 */
export default function SubscriptionsPage() {
  const [showHidden, setShowHidden] = useState(false);
  const subs = useSubscriptions(showHidden);
  const recompute = useRecomputeSubscriptions();
  const setStatus = useSetSubscriptionStatus();
  const alerts = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unreadAlerts = (alerts.data ?? []).filter((n) => !n.read);
  const items = subs.data ?? [];
  const active = items.filter((s) => s.status === "detected" || s.status === "confirmed");
  const monthlyTotalCents = active.reduce((sum, s) => sum + s.monthly_cost_cents, 0);

  const busyId = setStatus.isPending ? setStatus.variables?.id : undefined;
  const change = (id: string | null, status: SubscriptionStatus) => {
    if (id) setStatus.mutate({ id, status });
  };

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="-ml-2" aria-label="Back to Save & Earn">
            <Link to="/earn">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Subscriptions</h1>
            <p className="text-sm text-muted-foreground">Recurring charges we spotted.</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => recompute.mutate()}
          disabled={recompute.isPending}
        >
          <RefreshCw className={cn("mr-1.5 h-4 w-4", recompute.isPending && "animate-spin")} />
          {recompute.isPending ? "Scanning…" : "Rescan"}
        </Button>
      </div>

      {unreadAlerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Alerts</h2>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              className="text-xs text-muted-foreground hover:underline"
            >
              Mark all read
            </button>
          </div>
          <ul className="space-y-2">
            {unreadAlerts.map((n) => (
              <li
                key={n.id}
                className="flex items-start gap-2 rounded-lg border bg-primary/5 px-3 py-2"
              >
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label="Dismiss alert"
                  onClick={() => markRead.mutate(n.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {subs.isLoading ? (
        <>
          <TotalSkeleton />
          <ListSkeleton rows={4} />
        </>
      ) : items.length > 0 ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-bold tracking-tight">
                {formatCents(monthlyTotalCents)}
                <span className="text-base font-normal text-muted-foreground"> /mo</span>
              </p>
              <p className="text-sm text-muted-foreground">
                across {active.length} active subscription{active.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              className="text-sm text-muted-foreground hover:underline"
            >
              {showHidden ? "Hide dismissed" : "Show dismissed"}
            </button>
          </div>

          <SubscriptionInsights subs={active} />

          <ul className="divide-y rounded-xl border">
            {items.map((s) => (
              <SubscriptionRow
                key={s.id ?? s.merchant}
                sub={s}
                busy={busyId === s.id}
                onChange={change}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="rounded-xl border bg-muted/30 p-6 text-center">
          <p className="text-sm font-medium">No subscriptions detected yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan your transactions to find recurring charges.
          </p>
          <Button
            className="mt-4"
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
          >
            <RefreshCw className={cn("mr-1.5 h-4 w-4", recompute.isPending && "animate-spin")} />
            {recompute.isPending ? "Scanning…" : "Scan transactions"}
          </Button>
        </div>
      )}
    </section>
  );
}

function SubscriptionRow({
  sub,
  busy,
  onChange,
}: {
  sub: Subscription;
  busy: boolean;
  onChange: (id: string | null, status: SubscriptionStatus) => void;
}) {
  const hidden = sub.status === "dismissed" || sub.status === "cancelled";
  return (
    <li className={cn("px-4 py-3", hidden && "opacity-60")}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <span className="truncate">{sub.display_name}</span>
            {sub.status === "confirmed" && (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Confirmed" />
            )}
            {sub.type && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium capitalize text-primary">
                {sub.type}
              </span>
            )}
            {sub.status === "cancelled" && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                cancelled
              </span>
            )}
            {sub.status === "detected" && sub.confidence < 0.7 && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                likely
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCents(sub.amount_cents)} · {cadenceLabel(sub.cadence)} · next{" "}
            {format(parseISODate(sub.next_charge_on), "MMM d")}
          </p>
        </div>
        <span className="shrink-0 text-right font-medium">
          {formatCents(sub.monthly_cost_cents)}
          <span className="text-xs font-normal text-muted-foreground">/mo</span>
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1">
        {hidden ? (
          <RowAction
            label="Restore"
            icon={RotateCcw}
            disabled={busy}
            onClick={() => onChange(sub.id, "detected")}
          />
        ) : (
          <>
            {sub.status !== "confirmed" && (
              <RowAction
                label="Confirm"
                icon={Check}
                disabled={busy}
                onClick={() => onChange(sub.id, "confirmed")}
              />
            )}
            <RowAction
              label="I cancelled this"
              icon={Ban}
              disabled={busy}
              onClick={() => onChange(sub.id, "cancelled")}
            />
            <RowAction
              label="Not a subscription"
              icon={X}
              disabled={busy}
              onClick={() => onChange(sub.id, "dismissed")}
            />
          </>
        )}
      </div>
    </li>
  );
}

function RowAction({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof Check;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClick} disabled={disabled}>
      <Icon className="mr-1 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: "weekly",
  biweekly: "every 2 weeks",
  monthly: "monthly",
  bimonthly: "every 2 months",
  quarterly: "quarterly",
  semiannual: "every 6 months",
  annual: "yearly",
};

function cadenceLabel(cadence: Cadence): string {
  return CADENCE_LABELS[cadence] ?? cadence;
}
