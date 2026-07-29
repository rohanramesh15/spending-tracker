import { describe, it, expect } from "vitest";
import {
  CATEGORY_COLORS,
  CATEGORY_COLORS_DARK,
  HATCHED,
  categoryColor,
  categoryInk,
  categoryLabel,
  isHatched,
} from "./categories";

// The 7 taxonomy categories (backend/app/core/taxonomy.py) + 2 system categories + the
// unitemized bucket. If the taxonomy changes, this list and the palette change together.
const TAXONOMY = [
  "Food and Drinks",
  "Shopping",
  "Entertainment",
  "Travel/Transportation",
  "Health",
  "Services",
  "Other",
];
const SYSTEM = ["Tax", "Tip"];
const ALL = [...TAXONOMY, ...SYSTEM, "Uncategorized"];

/** WCAG relative luminance / contrast ratio, so contrast claims are computed not asserted. */
function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const chan = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("category palette coverage", () => {
  it("assigns a light and a dark color to every category, system category, and the bucket", () => {
    for (const name of ALL) {
      expect(CATEGORY_COLORS[name], `light ${name}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(CATEGORY_COLORS_DARK[name], `dark ${name}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("defines no colors beyond the known set (no orphan keys)", () => {
    expect(Object.keys(CATEGORY_COLORS).sort()).toEqual([...ALL].sort());
    expect(Object.keys(CATEGORY_COLORS_DARK).sort()).toEqual([...ALL].sort());
  });

  it("gives the 6 non-Other taxonomy categories distinct hues in both modes", () => {
    const spend = TAXONOMY.filter((c) => c !== "Other");
    for (const map of [CATEGORY_COLORS, CATEGORY_COLORS_DARK]) {
      const hues = spend.map((c) => map[c]);
      expect(new Set(hues).size).toBe(spend.length);
    }
  });
});

describe("Tax and Tip share a hue and separate by fill", () => {
  it("uses the same color for Tax and Tip in both modes", () => {
    expect(CATEGORY_COLORS.Tip).toBe(CATEGORY_COLORS.Tax);
    expect(CATEGORY_COLORS_DARK.Tip).toBe(CATEGORY_COLORS_DARK.Tax);
  });

  it("hatches Tip but not Tax, so the shared hue is still distinguishable", () => {
    expect(isHatched("Tip")).toBe(true);
    expect(isHatched("Tax")).toBe(false);
  });

  it("hatches the unitemized bucket at a different angle than Tip", () => {
    expect(isHatched("Uncategorized")).toBe(true);
    expect(HATCHED.Uncategorized).not.toBe(HATCHED.Tip);
  });

  it("leaves every real category solid", () => {
    for (const c of TAXONOMY) expect(isHatched(c)).toBe(false);
  });
});

describe("the palette is the validated set", () => {
  // These exact steps were run through the data-viz palette validator and pass every hard
  // gate on the adjacent pairlist in BOTH modes: worst adjacent normal-vision ΔE 19.6 light /
  // 19.3 dark (≥15 floor), worst CVD ΔE 9.1 light / 8.4 dark (≥8 target). Health owns red,
  // which is why no orange (#eb6834) appears anywhere — red↔orange separate by only ΔE 7.1
  // for normal vision, a hard fail. Changing any hex below invalidates that run: re-run the
  // validator before editing this list, don't just update the expectation.
  it("pins the validated light steps", () => {
    expect(CATEGORY_COLORS).toEqual({
      "Food and Drinks": "#eda100",
      Shopping: "#2a78d6",
      "Travel/Transportation": "#1baf7a",
      Health: "#e34948",
      Services: "#008300",
      Entertainment: "#4a3aa7",
      Tax: "#e87ba4",
      Tip: "#e87ba4",
      Other: "#52514e",
      Uncategorized: "#c9c7bf",
    });
  });

  it("pins the validated dark steps", () => {
    expect(CATEGORY_COLORS_DARK).toEqual({
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
    });
  });

  it("keeps the collision-prone orange out of the palette entirely", () => {
    const all = [...Object.values(CATEGORY_COLORS), ...Object.values(CATEGORY_COLORS_DARK)];
    expect(all).not.toContain("#eb6834");
    expect(all).not.toContain("#d95926");
  });
});

describe("chip ink clears text contrast", () => {
  it("every chip label reaches 4.5:1 against the chip's tinted background", () => {
    for (const name of ALL) {
      // The chip background is the fill at 10% over white — approximate as near-white.
      const ratio = contrast(categoryInk(name), "#ffffff");
      expect(ratio, `${name} ink ${categoryInk(name)}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("color assignment is by entity, never by position", () => {
  it("returns Other's neutral for an unknown label instead of borrowing a hue", () => {
    expect(categoryColor("Not A Real Category")).toBe(CATEGORY_COLORS.Other);
    expect(categoryColor("Not A Real Category", "dark")).toBe(CATEGORY_COLORS_DARK.Other);
  });

  it("returns the same color for a category regardless of call order", () => {
    const first = categoryColor("Health");
    categoryColor("Shopping");
    categoryColor("Tax");
    expect(categoryColor("Health")).toBe(first);
  });

  it("defaults to light mode", () => {
    expect(categoryColor("Shopping")).toBe(CATEGORY_COLORS.Shopping);
  });
});

describe("display labels", () => {
  it("shows the unitemized bucket as 'Not itemized'", () => {
    expect(categoryLabel("Uncategorized")).toBe("Not itemized");
  });

  it("passes real categories through unchanged", () => {
    for (const c of [...TAXONOMY, ...SYSTEM]) expect(categoryLabel(c)).toBe(c);
  });
});
