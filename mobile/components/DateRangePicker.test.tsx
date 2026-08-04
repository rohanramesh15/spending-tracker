import { useState } from "react";

import { DateRangePicker, type DateRangeValue } from "@/components/DateRangePicker";
import { rangePresets } from "@shared/lib/dates";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

function Harness({ initial, onChange }: { initial: DateRangeValue; onChange: jest.Mock }) {
  const [value, setValue] = useState(initial);
  return (
    <DateRangePicker
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const march = { start: "2026-03-01", end: "2026-03-31" };

describe("DateRangePicker", () => {
  it("shows the current range on the trigger", async () => {
    await renderWithProviders(<Harness initial={march} onChange={jest.fn()} />);
    expect(screen.getByText("Mar 1–31, 2026")).toBeTruthy();
  });

  it("renders a single day as one date, not a range", async () => {
    // user-flow §8a makes single-day first-class; "Mar 2 – Mar 2" would read as a bug.
    await renderWithProviders(
      <Harness initial={{ start: "2026-03-02", end: "2026-03-02" }} onChange={jest.fn()} />,
    );
    expect(screen.getByText("Mar 2, 2026")).toBeTruthy();
  });

  it("offers exactly the shared presets, so both clients agree", async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Harness initial={march} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId("date-range-trigger"));

    for (const preset of rangePresets()) {
      expect(screen.getByTestId(`preset-${preset.label}`)).toBeTruthy();
    }
  });

  it("applies a chosen preset", async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Harness initial={march} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId("date-range-trigger"));

    const today = rangePresets().find((p) => p.label === "Today")!;
    await fireEvent.press(screen.getByTestId("preset-Today"));

    expect(onChange).toHaveBeenCalledWith({ start: today.start, end: today.end });
  });
});

describe("custom range labels", () => {
  it("writes the dates in words rather than as raw ISO strings", async () => {
    // "2026-03-01" is the storage format, not something to read — and a bare numeric date is
    // ambiguous across locales besides.
    await renderWithProviders(
      <DateRangePicker value={{ start: "2026-03-01", end: "2026-03-31" }} onChange={jest.fn()} />,
    );
    await fireEvent.press(screen.getByTestId("date-range-trigger"));

    expect(screen.getByTestId("custom-start")).toHaveTextContent("From 1 Mar 2026");
    expect(screen.getByTestId("custom-end")).toHaveTextContent("To 31 Mar 2026");
  });

  it("renders the first of a month as that day, not the last of the previous one", async () => {
    // UTC parsing turns "2026-03-01" into 28 Feb anywhere behind UTC (CLAUDE.md #2).
    await renderWithProviders(
      <DateRangePicker value={{ start: "2026-03-01", end: "2026-03-31" }} onChange={jest.fn()} />,
    );
    await fireEvent.press(screen.getByTestId("date-range-trigger"));

    expect(screen.queryByText(/28 Feb/)).toBeNull();
  });
});
