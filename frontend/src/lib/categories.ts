// Fixed color per category — the single source of truth for the spending pie AND the
// category chips on transaction rows, so a category always reads the same everywhere.
//
// Palette rules this file obeys (validated, not eyeballed — see docs/implementation-plan.md
// §9 for the run):
//  - Colors are assigned per category and NEVER cycled positionally. An unknown label falls
//    back to Other's neutral; it does not borrow another category's hue.
//  - The 7 taxonomy categories get 7 distinct hues. Health owns red, which rules out orange
//    (red↔orange separate by only ΔE 7.1 for normal vision — a hard fail), so the palette
//    tops out at 7 hues.
//  - Tax and Tip therefore SHARE the magenta hue and are separated by fill instead: Tax
//    solid, Tip 45° hatched (see HATCHED). They are semantic siblings — both transaction-
//    level, non-item amounts — so one hue family is honest, and hatching survives both
//    color-vision deficiency and dark mode where a second magenta step would not.
//  - "Uncategorized" is not a category: it's the bucket unitemized transactions chart under,
//    and its size doubles as the "receipts not yet scanned" to-do. It stays separate from
//    Other (a category the classifier actually chose) and is hatched at 135° to read as
//    absence of data rather than as a category. UI label: see CATEGORY_LABELS.

export type ColorMode = "light" | "dark";

/** Slice/chip fill per category, light surface. */
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

/** The same hues re-stepped for a dark surface — selected, not an automatic flip. */
export const CATEGORY_COLORS_DARK: Record<string, string> = {
  "Food and Drinks": "#c98500",
  Shopping: "#3987e5",
  "Travel/Transportation": "#199e70",
  Health: "#e66767",
  Services: "#008300",
  Entertainment: "#9085e9",
  Tax: "#d55181",
  Tip: "#d55181",
  Other: "#a8a79f",
  Uncategorized: "#4a4944",
};

/** Darker steps used as chip TEXT, where WCAG text contrast (≥4.5:1) applies rather than
 *  the 3:1 non-text floor the fills are validated against. */
const CATEGORY_INK: Record<string, string> = {
  "Food and Drinks": "#8a5a00",
  Shopping: "#1c5cab",
  "Travel/Transportation": "#0d6b4a",
  Health: "#b02a2a",
  Services: "#006200",
  Entertainment: "#4a3aa7",
  Tax: "#a8325c",
  Tip: "#a8325c",
  Other: "#52514e",
  Uncategorized: "#6b6a63",
};

/** Categories drawn with a hatch over their fill, and the angle to hatch them at. Fill alone
 *  does not identify these — the text label beside them does; the hatch only separates them
 *  from the solid slice sharing their hue. */
export const HATCHED: Record<string, number> = {
  Tip: 45,
  Uncategorized: 135,
};

/** Display labels where the stored key reads badly in the UI. The backend key is unchanged. */
export const CATEGORY_LABELS: Record<string, string> = {
  Uncategorized: "Not itemized",
};

const FALLBACK_LIGHT = CATEGORY_COLORS.Other;
const FALLBACK_DARK = CATEGORY_COLORS_DARK.Other;

export function categoryColor(name: string, mode: ColorMode = "light"): string {
  return mode === "dark"
    ? (CATEGORY_COLORS_DARK[name] ?? FALLBACK_DARK)
    : (CATEGORY_COLORS[name] ?? FALLBACK_LIGHT);
}

/** Chip text color — darker than the fill so the label clears text contrast. */
export function categoryInk(name: string): string {
  return CATEGORY_INK[name] ?? CATEGORY_INK.Other;
}

export function isHatched(name: string): boolean {
  return name in HATCHED;
}

export function categoryLabel(name: string): string {
  return CATEGORY_LABELS[name] ?? name;
}
