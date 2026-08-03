/**
 * Money formatting/parsing. Shared by the web SPA and the Expo app.
 *
 * Money is integer cents everywhere (CLAUDE.md convention #1) — the division by 100 happens
 * only at the UI edge, here. This file must exist exactly once: a per-platform copy is how
 * a rounding difference silently appears between clients.
 *
 * Hermes note: `Intl.NumberFormat` requires a full-ICU build. Expo ships full ICU on iOS,
 * so this works — but assert real formatted output on device rather than trusting the
 * Node-based unit test alone (see docs/expo-conversion-plan.md §8).
 */

/** Format integer cents as a currency string. */
export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * Parse a user-typed dollar amount into integer cents. Rounds to the nearest cent
 * so floating-point never leaks into stored money (CLAUDE.md #1). Returns null for
 * un-parseable input.
 */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "" || Number.isNaN(Number(cleaned))) return null;
  return Math.round(Number(cleaned) * 100);
}

/** The inverse of dollarsToCents, for prefilling an editable dollar-amount input. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
