import { Link } from "react-router-dom";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { useReviews, useSpending, useTransactions } from "@/api/hooks";
import { SpendingPie } from "@/components/SpendingPie";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";
import { toISODate, parseISODate } from "@/lib/dates";

/**
 * Home — the daily loop (user-flow §2): this-month total + pie, recent transactions,
 * and a friendly empty state when there's no data yet.
 */
export default function HomePage() {
  const now = new Date();
  const start = toISODate(startOfMonth(now));
  const end = toISODate(endOfMonth(now));

  const spending = useSpending(start, end);
  const recent = useTransactions();
  const reviews = useReviews();

  const hasSpending = (spending.data?.slices.length ?? 0) > 0;
  const reviewCount = reviews.data?.length ?? 0;

  return (
    <section className="space-y-6">
      {reviewCount > 0 && (
        <Link
          to="/review"
          className="flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm font-medium text-warning-foreground"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {reviewCount} transaction{reviewCount === 1 ? "" : "s"} need review
          <span className="ml-auto">→</span>
        </Link>
      )}

      <div>
        <h1 className="text-xl font-semibold">{format(now, "MMMM yyyy")}</h1>
        <p className="text-3xl font-bold tracking-tight">
          {formatCents(spending.data?.total_cents ?? 0)}
        </p>
        <p className="text-sm text-muted-foreground">spent this month</p>
      </div>

      {hasSpending ? (
        <SpendingPie slices={spending.data!.slices} />
      ) : (
        <div className="rounded-xl border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">Nothing tracked yet this month.</p>
          <Button asChild variant="link" className="mt-1">
            <Link to="/add">Add a purchase</Link>
          </Button>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent</h2>
          <Link
            to="/transactions"
            className="text-sm text-muted-foreground hover:underline"
          >
            See all →
          </Link>
        </div>
        {recent.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : recent.data && recent.data.length > 0 ? (
          <ul className="divide-y rounded-xl border">
            {recent.data.slice(0, 6).map((t) => (
              <li key={t.id}>
                <Link
                  to={`/transactions/${t.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/40"
                >
                  <div>
                    <p className="font-medium">{t.vendor}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISODate(t.purchased_on), "MMM d")} ·{" "}
                      {t.item_count > 0
                        ? `${t.item_count} item${t.item_count === 1 ? "" : "s"}`
                        : "Uncategorized"}
                    </p>
                  </div>
                  <span className="font-medium">
                    {formatCents(t.total_cents, t.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        )}
      </div>
    </section>
  );
}
