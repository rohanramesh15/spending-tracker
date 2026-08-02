/**
 * Mirrors `frontend/src/lib/categories.ts` so the chart on this page is the same
 * chart the app draws — same hues, same hatching, same display labels.
 *
 * Copied rather than imported: the site is deliberately independent of the app's
 * build (see website/README.md). If the app's palette changes, change it here too.
 */

export const CATEGORY_COLORS: Record<string, string> = {
  "Food and Drinks": "#eda100", // amber
  Shopping: "#2a78d6", // blue
  "Travel/Transportation": "#1baf7a", // aqua
  Health: "#e34948", // red
  Services: "#008300", // green
  Entertainment: "#4a3aa7", // violet
  Tax: "#e87ba4", // magenta, solid
  Tip: "#e87ba4", // magenta, hatched
  Other: "#52514e", // neutral
  Uncategorized: "#c9c7bf", // lightest neutral, hatched
};

/** Categories drawn with a hatch over their fill, and the angle to hatch them at. */
export const HATCHED: Record<string, number> = {
  Tip: 45,
  Uncategorized: 135,
};

/** Display labels where the stored key reads badly in the UI. */
export const CATEGORY_LABELS: Record<string, string> = {
  Uncategorized: "Not itemized",
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other;
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function isHatched(category: string): boolean {
  return category in HATCHED;
}
