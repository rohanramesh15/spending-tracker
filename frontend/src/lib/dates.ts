import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
} from "date-fns";

/** Local calendar dates as YYYY-MM-DD (matches the backend's local `purchased_on`). */
export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * Parse a YYYY-MM-DD string as a LOCAL calendar date. Never use `new Date("2026-07-02")`
 * for a purchased_on value — that parses as UTC midnight and renders a day early in
 * behind-UTC timezones (plan §6.6 / §10: purchased_on is a local date, never via UTC).
 */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export interface DateRange {
  start: string;
  end: string;
  label: string;
}

/** Presets for the spending chart (user-flow §8a: single day is first-class). */
export function rangePresets(now = new Date()): DateRange[] {
  return [
    {
      label: "This month",
      start: toISODate(startOfMonth(now)),
      end: toISODate(endOfMonth(now)),
    },
    {
      label: "Last month",
      start: toISODate(startOfMonth(subMonths(now, 1))),
      end: toISODate(endOfMonth(subMonths(now, 1))),
    },
    {
      label: "Last 90 days",
      start: toISODate(subDays(now, 89)),
      end: toISODate(now),
    },
    {
      label: "Today",
      start: toISODate(now),
      end: toISODate(now),
    },
  ];
}
