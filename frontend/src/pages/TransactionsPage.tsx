import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Plus, Camera, Pencil, Landmark } from "lucide-react";
import { useTransactions } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { cn, formatCents } from "@/lib/utils";
import { CategoryChips } from "@/components/CategoryChips";
import { ListSkeleton } from "@/components/Skeletons";
import { parseISODate } from "@/lib/dates";
import type { TransactionListItem, TransactionSource } from "@/api/types";

type Filter = "all" | "needs_review";

const SOURCE_ICON: Record<TransactionSource, typeof Camera> = {
  receipt: Camera,
  manual: Pencil,
  plaid: Landmark,
};

function groupByDay(txns: TransactionListItem[]): [string, TransactionListItem[]][] {
  const groups = new Map<string, TransactionListItem[]>();
  for (const t of txns) {
    const arr = groups.get(t.purchased_on) ?? [];
    arr.push(t);
    groups.set(t.purchased_on, arr);
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

/** Transactions — the browsable ledger (user-flow §5), grouped by day. */
export default function TransactionsPage() {
  const { data, isLoading } = useTransactions();
  const [filter, setFilter] = useState<Filter>("all");

  const all = data ?? [];
  const reviewCount = all.filter((t) => t.review_status === "needs_review").length;
  const visible =
    filter === "needs_review"
      ? all.filter((t) => t.review_status === "needs_review")
      : all;
  const groups = groupByDay(visible);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <Button asChild size="sm">
          <Link to="/add">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Link>
        </Button>
      </div>

      {/* Filter (user-flow §5). The 'Needs review' toggle only appears when there's a queue. */}
      {reviewCount > 0 && (
        <div className="inline-flex rounded-lg border p-1 text-sm">
          {(["all", "needs_review"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {f === "all" ? "All" : `Needs review (${reviewCount})`}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : groups.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {filter === "needs_review" ? (
            "Nothing needs review."
          ) : (
            <>
              No transactions yet.{" "}
              <Link to="/add" className="text-primary hover:underline">
                Add one
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <div key={day}>
              <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {format(parseISODate(day), "EEEE, MMM d")}
              </h2>
              <ul className="divide-y rounded-xl border">
                {items.map((t) => {
                  const Icon = SOURCE_ICON[t.source];
                  return (
                    <li key={t.id}>
                      <Link
                        to={`/transactions/${t.id}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{t.vendor}</p>
                            <p className="text-xs text-muted-foreground">
                              {t.item_count > 0
                                ? `${t.item_count} item${t.item_count === 1 ? "" : "s"}`
                                : "Uncategorized"}
                              {t.review_status === "needs_review" && " · needs review"}
                            </p>
                            <CategoryChips categories={t.categories} />
                          </div>
                        </div>
                        <span className="font-medium">
                          {formatCents(t.total_cents, t.currency)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
