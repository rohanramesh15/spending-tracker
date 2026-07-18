import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { useReviews, useSpending, useTransactions } from "@/api/hooks";
import { SpendingPie } from "@/components/SpendingPie";
import { DateRangePicker, type DateRangeValue } from "@/components/DateRangePicker";
import { TotalSkeleton, ChartSkeleton, ListSkeleton } from "@/components/Skeletons";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";
import { CategoryChips } from "@/components/CategoryChips";
import { parseISODate, rangePresets, formatRangeLabel } from "@/lib/dates";

/**
 * Home — the daily loop (user-flow §2): spending total + pie for a selectable date range
 * (defaults to this month), recent transactions, and a friendly empty state.
 */
export default function HomePage() {
  const [range, setRange] = useState<DateRangeValue>(() => {
    const p = rangePresets()[0]; // This month
    return { start: p.start, end: p.end };
  });

  const spending = useSpending(range.start, range.end);
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

      <div className="flex items-start justify-between gap-3">
        <div>
          {spending.isLoading ? (
            <TotalSkeleton />
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight">
                {formatCents(spending.data?.total_cents ?? 0)}
              </p>
              <p className="text-sm text-muted-foreground">
                spent · {formatRangeLabel(range.start, range.end)}
              </p>
            </>
          )}
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {spending.isLoading ? (
        <ChartSkeleton />
      ) : hasSpending ? (
        <SpendingPie slices={spending.data!.slices} />
      ) : (
        <div className="rounded-xl border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">Nothing tracked in this range.</p>
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
          <ListSkeleton rows={4} />
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
                    <CategoryChips categories={t.categories} />
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
