import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { SpendingPie } from "./SpendingPie";
import { CATEGORY_COLORS } from "@/lib/categories";

// Recharts' ResponsiveContainer measures its parent, which jsdom reports as 0x0 — so it
// renders nothing. Swap it for a fixed-size box so the chart actually draws its slices.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <actual.ResponsiveContainer width={400} height={260}>
        {children}
      </actual.ResponsiveContainer>
    ),
  };
});

/** Slices animate in, so wait for them before reading fills. */
async function sectorFills(container: HTMLElement): Promise<(string | null)[]> {
  await waitFor(() => {
    expect(container.querySelectorAll("path.recharts-sector").length).toBeGreaterThan(0);
  });
  return [...container.querySelectorAll("path.recharts-sector")].map((p) =>
    p.getAttribute("fill"),
  );
}

const slices = [
  { category: "Food and Drinks", cents: 5000 },
  { category: "Health", cents: 3000 },
  { category: "Tax", cents: 400 },
  { category: "Tip", cents: 300 },
  { category: "Uncategorized", cents: 900 },
];

describe("SpendingPie fills", () => {
  it("fills Tip and the unitemized bucket from a hatch pattern, not a flat color", async () => {
    const { container } = render(<SpendingPie slices={slices} />);
    const fills = await sectorFills(container);
    expect(fills).toContain("url(#hatch-Tip)");
    expect(fills).toContain("url(#hatch-Uncategorized)");
  });

  it("defines a pattern for each hatched category, at different angles", () => {
    const { container } = render(<SpendingPie slices={slices} />);
    const tip = container.querySelector("#hatch-Tip");
    const uncat = container.querySelector("#hatch-Uncategorized");
    expect(tip).not.toBeNull();
    expect(uncat).not.toBeNull();
    expect(tip?.getAttribute("patternTransform")).not.toBe(
      uncat?.getAttribute("patternTransform"),
    );
  });

  it("fills Tax solid with the same hue Tip hatches over", async () => {
    const { container } = render(<SpendingPie slices={slices} />);
    const fills = await sectorFills(container);
    expect(fills).toContain(CATEGORY_COLORS.Tax);
    // The hatch pattern paints the same base hue underneath.
    const base = container.querySelector("#hatch-Tip rect");
    expect(base?.getAttribute("fill")).toBe(CATEGORY_COLORS.Tax);
  });

  it("labels the unitemized bucket 'Not itemized' in the legend", () => {
    const { getByText, queryByText } = render(<SpendingPie slices={slices} />);
    expect(getByText("Not itemized")).toBeTruthy();
    expect(queryByText("Uncategorized")).toBeNull();
  });
});
