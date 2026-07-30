import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CalendarDays, Check, ChevronLeft } from "lucide-react";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
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
 * rows and a "Custom range" row that pushes to an in-sheet calendar. Controlled — the
 * parent owns {start,end}. Single-day ranges (start === end) are first-class.
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
  // Draft range for the calendar view — only committed on Apply.
  const [draft, setDraft] = useState<DayPickerRange | undefined>();

  // Label the trigger with the active preset, or the explicit dates for a custom range.
  const activePreset = presets.find(
    (p) => p.start === value.start && p.end === value.end,
  );
  const label = activePreset?.label ?? formatRangeLabel(value.start, value.end);

  // Every open starts on the preset list, seeded with the current selection.
  useEffect(() => {
    if (!open) return;
    setView("presets");
    setDraft({ from: parseISODate(value.start), to: parseISODate(value.end) });
  }, [open, value.start, value.end]);

  function applyDraft() {
    if (!draft?.from) return;
    onChange({
      start: toISODate(draft.from),
      end: toISODate(draft.to ?? draft.from),
    });
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

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-0 z-50 bg-black/50",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg outline-none",
              "rounded-t-3xl bg-popover text-popover-foreground shadow-lg",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
              "duration-200",
            )}
            // Don't auto-focus the first row — feels less jumpy on mobile.
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {/* Grab handle — signals "drag/dismissable sheet", not a desktop menu. */}
            <div className="flex justify-center pb-1 pt-2.5">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="relative flex items-center justify-center px-4 pb-3">
              {view === "custom" && (
                <button
                  type="button"
                  onClick={() => setView("presets")}
                  aria-label="Back to presets"
                  className="absolute left-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <DialogPrimitive.Title className="text-base font-semibold">
                {view === "presets" ? "Date range" : "Custom range"}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Description className="sr-only">
              Choose the date range for your spending
            </DialogPrimitive.Description>

            <div className="px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {view === "presets" ? (
                <ul>
                  {presets.map((p) => {
                    const active = p.start === value.start && p.end === value.end;
                    return (
                      <li key={p.label}>
                        <button
                          type="button"
                          onClick={() => {
                            onChange({ start: p.start, end: p.end });
                            setOpen(false);
                          }}
                          className={cn(
                            "flex min-h-[3.25rem] w-full items-center justify-between gap-3 rounded-xl px-4 text-base",
                            "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                            active ? "font-semibold text-primary" : "font-medium",
                          )}
                        >
                          <span>{p.label}</span>
                          <span className="text-sm font-normal text-muted-foreground">
                            {active ? (
                              <Check className="h-5 w-5 text-primary" />
                            ) : (
                              formatRangeLabel(p.start, p.end)
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  <li>
                    <button
                      type="button"
                      onClick={() => setView("custom")}
                      className={cn(
                        "mt-1 flex min-h-[3.25rem] w-full items-center justify-between gap-3 rounded-xl border-t px-4 text-base",
                        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                        !activePreset ? "font-semibold text-primary" : "font-medium",
                      )}
                    >
                      <span>Custom range</span>
                      {!activePreset ? (
                        <Check className="h-5 w-5 text-primary" />
                      ) : (
                        <span className="text-sm text-muted-foreground">Pick dates</span>
                      )}
                    </button>
                  </li>
                </ul>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-center">
                    <Calendar
                      mode="range"
                      required={false}
                      selected={draft}
                      onSelect={setDraft}
                      defaultMonth={draft?.from ?? new Date()}
                      disabled={{ after: parseISODate(todayISO()) }}
                      // Big touch targets — the desktop 2rem cell is too small for a thumb.
                      className="[--cell-size:2.6rem] p-0"
                    />
                  </div>
                  <p className="text-center text-sm text-muted-foreground" aria-live="polite">
                    {draft?.from
                      ? formatRangeLabel(
                          toISODate(draft.from),
                          toISODate(draft.to ?? draft.from),
                        )
                      : "Tap a start date"}
                  </p>
                  <button
                    type="button"
                    onClick={applyDraft}
                    disabled={!draft?.from}
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
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
