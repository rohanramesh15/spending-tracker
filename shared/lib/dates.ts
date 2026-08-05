import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

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

/**
 * Human label for a range, e.g. "Mar 3 – Apr 1, 2026" (or a single day).
 *
 * `withYear: false` drops the year entirely — for a compact control (the mobile range trigger)
 * sitting on a screen that never states a year anywhere else. A range spanning a year boundary
 * keeps both years regardless: without them "Dec 28 – Jan 3" is genuinely ambiguous.
 */
export function formatRangeLabel(
  start: string,
  end: string,
  { withYear = true }: { withYear?: boolean } = {},
): string {
  const s = parseISODate(start);
  const e = parseISODate(end);
  const crossesYears = s.getFullYear() !== e.getFullYear();
  if (!withYear && !crossesYears) {
    if (start === end) return format(s, "MMM d");
    if (s.getMonth() === e.getMonth()) return `${format(s, "MMM d")}–${format(e, "d")}`;
    return `${format(s, "MMM d")} – ${format(e, "MMM d")}`;
  }
  if (start === end) return format(s, "MMM d, yyyy");

  // Within one month, name the month once: "Aug 1 – Aug 31, 2026" becomes "Aug 1–31, 2026".
  // Same-year ranges drop the repeated year for the same reason. The en dash tightens to no
  // surrounding spaces when it joins bare numbers, which is the usual typographic convention.
  const sameYear = s.getFullYear() === e.getFullYear();
  if (sameYear && s.getMonth() === e.getMonth()) {
    return `${format(s, "MMM d")}–${format(e, "d, yyyy")}`;
  }
  if (sameYear) return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;

  // Spanning a year boundary, both years must be stated or the range is ambiguous.
  return `${format(s, "MMM d, yyyy")} – ${format(e, "MMM d, yyyy")}`;
}

export interface DateRange {
  start: string;
  end: string;
  label: string;
}

/**
 * Presets for the spending chart.
 *
 * Deliberately just two. "Last 90 days" and "Today" were removed on request; a single day and any
 * other span are still reachable through the custom range, which is why dropping them costs
 * nothing but a tap. NOTE: user-flow §8a calls a single day "first-class", so this narrows that —
 * flagged rather than silently reinterpreted.
 *
 * Shared so both clients offer the same ranges; editing this list changes the web picker too.
 */
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
  ];
}
