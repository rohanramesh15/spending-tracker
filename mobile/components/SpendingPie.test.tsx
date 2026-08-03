import { processColor } from "react-native";

import { SpendingPie, donutSegmentPath, labelInkFor, percentLabel } from "@/components/SpendingPie";
import { categoryColor } from "@shared/lib/categories";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

const slices = [
  { category: "Food and Drinks", cents: 5000 },
  { category: "Shopping", cents: 3000 },
  { category: "Tip", cents: 2000 },
];

describe("donutSegmentPath", () => {
  it("draws an arc between the requested angles", () => {
    const d = donutSegmentPath(0, 90);
    // Outer arc sweeps clockwise (flag 1), inner arc back (flag 0) — reversing either renders
    // an inside-out wedge that still superficially looks like a chart slice.
    expect(d).toMatch(/^M /);
    expect(d).toContain("A 100 100 0 0 1");
    expect(d).toContain("A 58 58 0 0 0");
    expect(d.endsWith("Z")).toBe(true);
  });

  it("sets the large-arc flag for sweeps over 180 degrees", () => {
    expect(donutSegmentPath(0, 200)).toContain("A 100 100 0 1 1");
  });

  it("splits a full circle into two arcs", () => {
    // A 360° arc has coincident start and end points, so SVG renders nothing at all.
    const d = donutSegmentPath(0, 360);
    expect(d.match(/M /g)).toHaveLength(2);
  });

  it("starts at the top of the circle", () => {
    // 0° must be 12 o'clock, matching the web chart; an off-by-90 rotation is easy to miss.
    const d = donutSegmentPath(0, 90);
    const [, x, y] = d.match(/^M ([\d.]+) ([\d.]+)/) as RegExpMatchArray;
    expect(Number(x)).toBeCloseTo(110, 1); // centre x
    expect(Number(y)).toBeCloseTo(10, 1); // centre y - outer radius
  });
});

describe("percentLabel", () => {
  it("renders a whole-percent share", () => {
    expect(percentLabel(5000, 10000)).toBe("50%");
    expect(percentLabel(3333, 10000)).toBe("33%");
  });

  it("does not divide by a zero total", () => {
    expect(percentLabel(0, 0)).toBe("0%");
  });
});

describe("labelInkFor", () => {
  it("uses dark ink on light fills and white on dark ones", () => {
    expect(labelInkFor("#eda100")).toBe("#334155");
    expect(labelInkFor("#1c5cab")).toBe("#ffffff");
  });
});

describe("SpendingPie", () => {
  it("renders one slice per category", async () => {
    await renderWithProviders(<SpendingPie slices={slices} />);
    expect(screen.getByTestId("pie-slice-Food and Drinks")).toBeTruthy();
    expect(screen.getByTestId("pie-slice-Shopping")).toBeTruthy();
    expect(screen.getByTestId("pie-slice-Tip")).toBeTruthy();
  });

  it("fills solid categories from the shared palette", async () => {
    // react-native-svg normalises `fill` into { type: 0, payload: <int> }, so compare against
    // the processed shared color rather than a literal — this still fails if someone re-picks
    // the palette locally instead of changing shared/lib/categories.
    await renderWithProviders(<SpendingPie slices={slices} />);
    expect(screen.getByTestId("pie-slice-Shopping").props.fill).toMatchObject({
      payload: processColor(categoryColor("Shopping")),
    });
  });

  it("hatches Tip instead of filling it flat", async () => {
    // Tip shares its hue with Tax, so the hatch — not the color — is what tells them apart,
    // and it survives colour-vision deficiency where a second hue step would not.
    await renderWithProviders(<SpendingPie slices={slices} />);
    expect(screen.getByTestId("pie-slice-Tip").props.fill).toMatchObject({
      brushRef: "hatch-Tip",
    });
  });

  it("reveals the amount and percentage for a tapped slice", async () => {
    await renderWithProviders(<SpendingPie slices={slices} />);
    expect(screen.queryByTestId("pie-selection")).toBeNull();

    await fireEvent(screen.getByTestId("pie-slice-Food and Drinks"), "press");

    expect(screen.getByTestId("pie-selection")).toBeTruthy();
    expect(screen.getByText("$50.00")).toBeTruthy();
    // The percentage renders as an SVG text node; its arithmetic is covered by percentLabel.
    expect(screen.getByTestId("pie-percent")).toBeTruthy();
  });

  it("clears the selection when the same slice is tapped again", async () => {
    await renderWithProviders(<SpendingPie slices={slices} />);
    const slice = screen.getByTestId("pie-slice-Shopping");

    await fireEvent(slice, "press");
    expect(screen.getByTestId("pie-selection")).toBeTruthy();

    await fireEvent(screen.getByTestId("pie-slice-Shopping"), "press");
    expect(screen.queryByTestId("pie-selection")).toBeNull();
  });

  it("renders nothing when the total is zero rather than dividing by it", async () => {
    await renderWithProviders(<SpendingPie slices={[{ category: "Shopping", cents: 0 }]} />);
    expect(screen.queryByTestId("spending-pie")).toBeNull();
  });
});
