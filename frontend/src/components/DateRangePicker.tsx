import { useEffect, useState } from "react";
import { format, isBefore } from "date-fns";
import { CalendarDays, Check } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetRow } from "@/components/ui/sheet";
import {
  rangePresets,
  todayISO,
  toISODate,
  parseISODate,
  formatRangeLabel,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface DateRangeValue {
  start: string; // YYYY-MM-DD
  end: string;
}

/**
 * Date-range control (user-flow §6.6/§8a), mobile-first. The trigger is a compact pill;
 * tapping it opens a bottom sheet (same language as ActionSheet) with thumb-sized preset
 * rows and a "Custom range" row that pushes to a guided two-step calendar (pick the
 * first day, then the last). Controlled — the parent owns {start,end}. Single-day
 * ranges (start === end) are first-class.
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
  const [view, setView] = useState<"presets" | "custom">("presets");
  // Draft endpoints for the custom view — only committed on Apply.
  const [first, setFirst] = useState<Date | undefined>();
  const [last, setLast] = useState<Date | undefined>();
  // Which endpoint the calendar is currently choosing.
  const [editing, setEditing] = useState<"first" | "last">("first");
  // The visible month, so switching endpoints scrolls the calendar to that date.
  const [month, setMonth] = useState<Date>(new Date());

  // Label the trigger with the active preset, or the explicit dates for a custom range.
  const activePreset = presets.find(
    (p) => p.start === value.start && p.end === value.end,
  );
  const label = activePreset?.label ?? formatRangeLabel(value.start, value.end);

  // Every open starts on the preset list, seeded with the current selection.
  useEffect(() => {
    if (!open) return;
    setView("presets");
    setFirst(parseISODate(value.start));
    setLast(parseISODate(value.end));
    setEditing("first");
    setMonth(parseISODate(value.start));
  }, [open, value.start, value.end]);

  /** Switch which endpoint the calendar edits, scrolling to its date if it has one. */
  function focusEndpoint(which: "first" | "last") {
    setEditing(which);
    const target = which === "first" ? first : last;
    if (target) setMonth(target);
  }

  /**
   * Tapping a day fills whichever endpoint is being edited, then hands off: choosing the
   * first day advances to the last day, so the common case is two taps and Apply. A new
   * first day landing after the current last day clears it rather than inverting the range.
   */
  function pickDay(day: Date) {
    if (editing === "first") {
      setFirst(day);
      if (last && isBefore(last, day)) setLast(undefined);
      setEditing("last");
    } else {
      setLast(day);
    }
  }

  function applyDraft() {
    if (!first || !last) return;
    onChange({ start: toISODate(first), end: toISODate(last) });
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex min-h-11 items-center gap-1.5 rounded-full border bg-background px-3.5 py-2",
          "text-sm font-medium shadow-sm transition-transform active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 opacity-70" />
        <span className="max-w-[9.5rem] truncate">{label}</span>
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={view === "presets" ? "Date range" : "Custom range"}
        onBack={view === "custom" ? () => setView("presets") : undefined}
      >
        <>
          {view === "presets" ? (
            <ul>
              {presets.map((p) => {
                const active = p.start === value.start && p.end === value.end;
                return (
                  <li key={p.label}>
                    <SheetRow
                      selected={active}
                      onClick={() => {
                        onChange({ start: p.start, end: p.end });
                        setOpen(false);
                      }}
                      className="justify-between"
                    >
                      <span>{p.label}</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {active ? (
                          <Check className="h-5 w-5 text-primary" />
                        ) : (
                          formatRangeLabel(p.start, p.end)
                        )}
                      </span>
                    </SheetRow>
                  </li>
                );
              })}
              <li>
                <SheetRow
                  selected={!activePreset}
                  onClick={() => setView("custom")}
                  className="mt-1 justify-between border-t"
                >
                  <span>Custom range</span>
                  {!activePreset ? (
                    <Check className="h-5 w-5 text-primary" />
                  ) : (
                    <span className="text-sm font-normal text-muted-foreground">
                      Pick dates
                    </span>
                  )}
                </SheetRow>
              </li>
            </ul>
          ) : (
            <div className="space-y-3 px-2">
              {/* Two endpoint chips: the highlighted one is what the calendar edits.
                      Tapping a chip jumps back to that endpoint without losing the other. */}
              <div className="flex items-stretch gap-2">
                <EndpointChip
                  label="Starting"
                  date={first}
                  active={editing === "first"}
                  onClick={() => focusEndpoint("first")}
                />
                <EndpointChip
                  label="Ending"
                  date={last}
                  active={editing === "last"}
                  onClick={() => focusEndpoint("last")}
                />
              </div>

              <div className="flex justify-center">
                <Calendar
                  // Controlled by `pickDay`: mode="range" is only here for the
                  // start/middle/end highlight across the drafted span.
                  mode="range"
                  required={false}
                  selected={{ from: first, to: last }}
                  onSelect={() => {}}
                  onDayClick={pickDay}
                  month={month}
                  onMonthChange={setMonth}
                  disabled={
                    // Never allow a last day before the first, or a future date.
                    editing === "last" && first
                      ? [{ after: parseISODate(todayISO()) }, { before: first }]
                      : { after: parseISODate(todayISO()) }
                  }
                  // Big touch targets — the desktop 2rem cell is too small for a thumb.
                  className="[--cell-size:2.6rem] p-0"
                />
              </div>
              <p className="text-center text-sm text-muted-foreground" aria-live="polite">
                {first && last
                  ? formatRangeLabel(toISODate(first), toISODate(last))
                  : editing === "first"
                    ? "Pick the day the range starts"
                    : "Now pick the day it ends"}
              </p>
              <button
                type="button"
                onClick={applyDraft}
                disabled={!first || !last}
                className={cn(
                  "min-h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground",
                  "transition-transform active:scale-[0.98] disabled:opacity-50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                Apply
              </button>
            </div>
          )}
        </>
      </Sheet>
    </>
  );
}

/**
 * One of the two range endpoints, shown as a tappable chip above the calendar. The active
 * chip is ringed so it's obvious which date the next tap on the calendar will set.
 */
function EndpointChip({
  label,
  date,
  active,
  onClick,
}: {
  label: string;
  date: Date | undefined;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-[3.25rem] flex-1 flex-col justify-center rounded-xl border px-3 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input",
      )}
    >
      <span
        className={cn(
          "text-[0.7rem] font-medium uppercase tracking-wide",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-semibold",
          date ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {date ? format(date, "MMM d, yyyy") : "Tap to pick"}
      </span>
    </button>
  );
}
