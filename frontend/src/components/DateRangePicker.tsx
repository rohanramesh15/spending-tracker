import { useState } from "react";
import { rangePresets, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface DateRangeValue {
  start: string; // YYYY-MM-DD
  end: string;
}

/**
 * Date-range control (user-flow §6.6/§8a): preset chips (This month / Last month / Last 90
 * days / Today) plus a Custom range with two native date pickers. Controlled — the parent
 * owns {start,end} and feeds it to useSpending. Single-day ranges (start === end) are
 * first-class, both as the "Today" preset and via Custom.
 */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}) {
  const presets = rangePresets();
  const [mode, setMode] = useState<"preset" | "custom">("preset");

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "text-muted-foreground",
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setMode("preset");
              onChange({ start: p.start, end: p.end });
            }}
            className={chip(
              mode === "preset" && p.start === value.start && p.end === value.end,
            )}
          >
            {p.label}
          </button>
        ))}
        <button onClick={() => setMode("custom")} className={chip(mode === "custom")}>
          Custom
        </button>
      </div>

      {mode === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            aria-label="Start date"
            value={value.start}
            max={value.end || todayISO()}
            onChange={(e) =>
              e.target.value && onChange({ ...value, start: e.target.value })
            }
            className="rounded-md border bg-background px-2 py-1"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            aria-label="End date"
            value={value.end}
            min={value.start}
            onChange={(e) =>
              e.target.value && onChange({ ...value, end: e.target.value })
            }
            className="rounded-md border bg-background px-2 py-1"
          />
        </div>
      )}
    </div>
  );
}
