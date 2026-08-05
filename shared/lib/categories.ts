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

/**
 * Display labels where the stored key reads badly in the UI. The backend key is unchanged —
 * "Food and Drinks" is the taxonomy value the classifier emits and the DB stores, and renaming
 * it would break category matching everywhere. Only the rendering differs.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  Uncategorized: "Not itemized",
  // "&" reads better than "and" in a short label, and keeps the chip narrow.
  "Food and Drinks": "Food & Drinks",
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

/**
 * How much of the category hue survives in a chip background. 0 = white, 1 = the full fill.
 * Low by design: the chip is a quiet label behind dark text, not a color swatch.
 */
const TINT_STRENGTH = 0.14;

/**
 * Very light tint of a category's hue, for chip BACKGROUNDS.
 *
 * Chips used to be filled with the solid category color and rely on `categoryInk` to stay
 * legible on top of it. That made a row of chips shout louder than the transaction itself.
 * Pairing the existing dark ink with a wash of the same hue keeps the category identifiable
 * while letting the vendor and amount lead.
 *
 * Derived from `CATEGORY_COLORS` rather than hand-picked so a chip can never drift out of sync
 * with its slice — the pie and the chip stay the same hue by construction. The pairing is not
 * assumed safe: categories.test.ts asserts every ink/tint pair clears WCAG AA (4.5:1).
 */
export function categoryTint(name: string): string {
  return mixWithWhite(categoryColor(name), TINT_STRENGTH);
}

/** Blend `hex` toward white. `strength` is the fraction of the original color retained. */
function mixWithWhite(hex: string, strength: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c * strength + 255 * (1 - strength));
  return rgbToHex(mix(r), mix(g), mix(b));
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function isHatched(name: string): boolean {
  return name in HATCHED;
}

/**
 * Order categories for display: "Other" always last.
 *
 * "Other" is the classifier's fallback, not a finding — it says nothing about what was bought.
 * Letting it lead a transaction's category line buries the informative labels behind the one
 * that carries no information. Everything else keeps the order it arrived in (the API returns
 * distinct line-item categories in item order, which is meaningful).
 */
export function orderCategories(names: string[]): string[] {
  return [...names].sort((a, b) => Number(a === "Other") - Number(b === "Other"));
}

export function categoryLabel(name: string): string {
  return CATEGORY_LABELS[name] ?? name;
}
