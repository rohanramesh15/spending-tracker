import { useState } from "react";
import { format } from "date-fns";
import { useSpending } from "@/api/hooks";
import { SpendingPie } from "@/components/SpendingPie";
import { rangePresets, parseISODate } from "@/lib/dates";
import { formatCents, cn } from "@/lib/utils";

/**
 * Insights — spending chart (user-flow §8a). Presets incl. single-day ("Today");
 * graceful empty state for a range with no spending. Recurring + finder are Phases 4–5.
 */
export default function InsightsPage() {
  const presets = rangePresets();
  const [active, setActive] = useState(0);
  const range = presets[active];
  const { data, isLoading } = useSpending(range.start, range.end);

  const hasData = (data?.slices.length ?? 0) > 0;
  const rangeLabel =
    range.start === range.end
      ? format(parseISODate(range.start), "MMM d, yyyy")
      : `${format(parseISODate(range.start), "MMM d")} – ${format(parseISODate(range.end), "MMM d")}`;

  return (
    <section className="space-y-5">
      <h1 className="text-xl font-semibold">Insights</h1>

      <div className="flex flex-wrap gap-2">
        {presets.map((p, i) => (
          <button
            key={p.label}
            onClick={() => setActive(i)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              i === active
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

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
    </section>
  );
}
