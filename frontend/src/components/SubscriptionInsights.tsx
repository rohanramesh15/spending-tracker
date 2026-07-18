import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format } from "date-fns";
import { useSubscriptionSummary } from "@/api/hooks";
import type { Subscription } from "@/api/types";
import { formatCents } from "@/lib/utils";
import { parseISODate } from "@/lib/dates";

/**
 * Insights for the Agents page (docs/subscriptions-plan.md §6, v5): annualized spend, a
 * recurring-spend trend, a by-type breakdown, and a duplicate-streaming savings hint.
 * Renders nothing until the summary loads or when there are no active subscriptions.
 */
export function SubscriptionInsights({ subs }: { subs: Subscription[] }) {
  const summary = useSubscriptionSummary();
  const s = summary.data;
  if (!s || s.active_count === 0) return null;

  const streaming = subs.filter((x) => x.type === "streaming");
  const streamingMonthly = streaming.reduce((sum, x) => sum + x.monthly_cost_cents, 0);

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">
        ≈ <span className="font-semibold text-foreground">{formatCents(s.annualized_cents)}</span>{" "}
        per year across {s.active_count} subscription{s.active_count === 1 ? "" : "s"}
      </p>

      {s.trend.some((t) => t.cents > 0) && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Recurring spend</p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={s.trend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <XAxis
                dataKey="month"
                tickFormatter={(m: string) => format(parseISODate(`${m}-01`), "MMM")}
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <Tooltip
                formatter={(v: number) => formatCents(v)}
                labelFormatter={(m: string) => format(parseISODate(`${m}-01`), "MMMM yyyy")}
              />
              <Bar dataKey="cents" radius={[4, 4, 0, 0]}>
                {s.trend.map((t) => (
                  <Cell key={t.month} fill="#2563eb" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {s.by_type.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {s.by_type.map((b) => (
            <span
              key={b.type}
              className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              <span className="capitalize">{b.type}</span> · {formatCents(b.monthly_cents)}/mo
            </span>
          ))}
        </div>
      )}

      {streaming.length >= 2 && (
        <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          You have {streaming.length} streaming services costing{" "}
          <span className="font-medium text-foreground">{formatCents(streamingMonthly)}/mo</span> —
          consolidating could save money.
        </p>
      )}
    </div>
  );
}
