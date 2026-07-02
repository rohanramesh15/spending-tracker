import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui className helper. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format integer cents as a currency string. Money is integer cents everywhere
 * (see CLAUDE.md convention #1); the UI only ever divides by 100 at the edge.
 */
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
