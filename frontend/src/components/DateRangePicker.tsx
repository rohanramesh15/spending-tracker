import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { rangePresets, todayISO, formatRangeLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface DateRangeValue {
  start: string; // YYYY-MM-DD
  end: string;
}

/**
 * Date-range control (user-flow §6.6/§8a). A single trigger on the right shows the current
 * selection; pressing it opens a dropdown with the presets (This month / Last month / Last
 * 90 days / Today) plus a Custom range with two native date pickers. Controlled — the parent
 * owns {start,end}. Single-day ranges (start === end) are first-class.
 */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}) {
  const presets = rangePresets();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Label the trigger with the active preset, or the explicit dates for a custom range.
  const activePreset = presets.find(
    (p) => p.start === value.start && p.end === value.end,
  );
  const label = activePreset?.label ?? formatRangeLabel(value.start, value.end);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span>{label}</span>
        <ChevronDown
          className={cn("h-4 w-4 opacity-60 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {presets.map((p) => {
            const active = p.start === value.start && p.end === value.end;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  onChange({ start: p.start, end: p.end });
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                  active && "font-medium text-primary",
                )}
              >
                {p.label}
                {active && <Check className="h-4 w-4" />}
              </button>
            );
          })}

          <div className="my-1 h-px bg-border" />

          <div className="space-y-1.5 px-2 py-1.5">
            <p className="text-xs font-medium text-muted-foreground">Custom range</p>
            <label className="block text-xs text-muted-foreground">
              From
              <input
                type="date"
                aria-label="Start date"
                value={value.start}
                max={value.end || todayISO()}
                onChange={(e) =>
                  e.target.value && onChange({ ...value, start: e.target.value })
                }
                className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              To
              <input
                type="date"
                aria-label="End date"
                value={value.end}
                min={value.start}
                max={todayISO()}
                onChange={(e) =>
                  e.target.value && onChange({ ...value, end: e.target.value })
                }
                className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
