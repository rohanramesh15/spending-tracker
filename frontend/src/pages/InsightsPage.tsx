import { useState } from "react";
import { Link } from "react-router-dom";
import { Repeat } from "lucide-react";
import { useRecurring, useSpending } from "@/api/hooks";
import { SpendingPie } from "@/components/SpendingPie";
import { Sparkline } from "@/components/Sparkline";
import { DateRangePicker, type DateRangeValue } from "@/components/DateRangePicker";
import { rangePresets, formatRangeLabel } from "@/lib/dates";
import { formatCents } from "@/lib/utils";
import type { RecurringItem } from "@/api/types";

const initialRange = (): DateRangeValue => {
  const p = rangePresets()[0]; // This month
  return { start: p.start, end: p.end };
};

/**
 * Insights — spending chart (user-flow §8a) + recurring items (§8b) + finder link (§8c).
 * The date range (presets or custom) drives the chart.
 */
export default function InsightsPage() {
  const [range, setRange] = useState<DateRangeValue>(initialRange);
  const { data, isLoading } = useSpending(range.start, range.end);
  const recurring = useRecurring();

  const hasData = (data?.slices.length ?? 0) > 0;
  const rangeLabel = formatRangeLabel(range.start, range.end);

  return (
    <section className="space-y-5">
      <h1 className="text-xl font-semibold">Insights</h1>

      <DateRangePicker value={range} onChange={setRange} />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : hasData ? (
        <>
          <p className="text-2xl font-bold">{formatCents(data!.total_cents)}</p>
          <SpendingPie slices={data!.slices} />
        </>
      ) : (
        <div className="rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No spending recorded for {rangeLabel}.
        </div>
      )}

      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Recurring items</h2>
        </div>
        {recurring.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : recurring.data && recurring.data.length > 0 ? (
          <ul className="divide-y rounded-xl border">
            {recurring.data.map((item) => (
              <RecurringRow key={item.canonical_name} item={item} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            Nothing recurring yet — items you buy 3+ times show up here.
          </p>
        )}
      </div>
    </section>
  );
}

function RecurringRow({ item }: { item: RecurringItem }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium capitalize">{item.canonical_name}</p>
        <p className="text-xs text-muted-foreground">
          bought {item.occurrences}×{item.category_name ? ` · ${item.category_name}` : ""}
        </p>
        <Link
          to={`/finder?item=${encodeURIComponent(item.canonical_name)}${
            item.category_name
              ? `&category=${encodeURIComponent(item.category_name)}`
              : ""
          }`}
          className="text-xs font-medium text-primary hover:underline"
        >
          Find it cheaper →
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <Sparkline values={item.price_history.map((p) => p.unit_price_cents)} />
        <div className="text-right">
          <p className="text-sm font-medium">{formatCents(item.avg_unit_price_cents)}</p>
          <p className="text-xs text-muted-foreground">avg / unit</p>
        </div>
      </div>
    </li>
  );
}
