import { processColor } from "react-native";

import {
  INNER,
  OUTER,
  SpendingPie,
  donutSegmentPath,
  labelInkFor,
  percentLabel,
} from "@/components/SpendingPie";
import { categoryColor } from "@shared/lib/categories";
import { fireEvent, renderWithProviders, screen, within } from "@/test-utils";

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
    expect(d).toContain(`A ${OUTER} ${OUTER} 0 0 1`);
    expect(d).toContain(`A ${INNER} ${INNER} 0 0 0`);
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

describe("controlled selection", () => {
  // Home owns the selection so it can clear it when the user taps somewhere else on the page —
  // a tap outside the chart is invisible to the chart itself.
  const slices = [
    { category: "Health", cents: 500 },
    { category: "Shopping", cents: 500 },
  ];

  it("reports a tapped slice to the owner instead of selecting internally", async () => {
    const onActiveIndexChange = jest.fn();
    await renderWithProviders(
      <SpendingPie slices={slices} activeIndex={-1} onActiveIndexChange={onActiveIndexChange} />,
    );

    await fireEvent.press(screen.getByTestId("pie-slice-Shopping"));

    expect(onActiveIndexChange).toHaveBeenCalledWith(1);
    // No readout appeared on its own: the owner decides what is selected.
    expect(screen.queryByTestId("pie-selection")).toBeNull();
  });

  it("shows the readout for whichever slice the owner selected", async () => {
    await renderWithProviders(
      <SpendingPie slices={slices} activeIndex={0} onActiveIndexChange={jest.fn()} />,
    );

    // Scoped to the readout: the legend below also lists every category by name.
    const readout = screen.getByTestId("pie-selection");
    expect(within(readout).getByText("Health")).toBeTruthy();
    expect(within(readout).getByText("$5.00")).toBeTruthy();
  });

  it("returns to the default view when the owner clears the selection", async () => {
    const view = await renderWithProviders(
      <SpendingPie slices={slices} activeIndex={0} onActiveIndexChange={jest.fn()} />,
    );
    expect(screen.getByTestId("pie-selection")).toBeTruthy();

    await view.rerender(
      <SpendingPie slices={slices} activeIndex={-1} onActiveIndexChange={jest.fn()} />,
    );

    expect(screen.queryByTestId("pie-selection")).toBeNull();
  });

  it("asks the owner to deselect when the selected slice is tapped again", async () => {
    const onActiveIndexChange = jest.fn();
    await renderWithProviders(
      <SpendingPie slices={slices} activeIndex={0} onActiveIndexChange={onActiveIndexChange} />,
    );

    await fireEvent.press(screen.getByTestId("pie-slice-Health"));

    expect(onActiveIndexChange).toHaveBeenCalledWith(-1);
  });

  it("still manages its own selection when left uncontrolled", async () => {
    await renderWithProviders(<SpendingPie slices={slices} />);

    await fireEvent.press(screen.getByTestId("pie-slice-Health"));

    expect(screen.getByTestId("pie-selection")).toBeTruthy();
  });
});

describe("the percentage readout stays visible", () => {
  it("does not report a visible slice as 0%", () => {
    // A 0.3% slice is drawn on screen. Rounding it to "0%" contradicts what the user can see.
    expect(percentLabel(3, 1000)).toBe("<1%");
  });

  it("still rounds normally above the half-percent mark", () => {
    expect(percentLabel(6, 1000)).toBe("1%");
    expect(percentLabel(500, 1000)).toBe("50%");
  });

  it("reports an empty chart as 0%", () => {
    expect(percentLabel(0, 0)).toBe("0%");
  });

  it("inks the centre label for the page, not the slice", async () => {
    // The label sits in the donut hole, over the page. Taking its colour from the slice made
    // dark slices render white-on-white, so the percentage vanished exactly when tapped.
    const slices = [
      { category: "Other", cents: 900 },
      { category: "Health", cents: 100 },
    ];
    await renderWithProviders(
      <SpendingPie slices={slices} activeIndex={0} onActiveIndexChange={jest.fn()} />,
    );

    // react-native-svg hands back a PROCESSED colour ({ type, payload }), not the string that
    // was passed in — comparing against "#ffffff" silently passes and tests nothing.
    const fill = screen.getByTestId("pie-percent").props.fill;
    expect(fill.payload).not.toBe(processColor("#ffffff"));
  });
});

describe("ring thickness", () => {
  it("keeps the ring thick enough for a small slice to be visible and tappable", () => {
    // A 1% wedge on a thin ring is a hairline — and it still has to be a touch target.
    expect(OUTER - INNER).toBeGreaterThanOrEqual(50);
  });
});
