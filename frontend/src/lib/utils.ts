import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * shadcn/ui className helper. WEB ONLY — deliberately not moved to shared/, since the Expo
 * app uses Tamagui and has no use for Tailwind class merging.
 *
 * Money helpers (formatCents, dollarsToCents, centsToInput) now live in @shared/lib/money
 * so the web and native clients cannot drift on cents handling.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
