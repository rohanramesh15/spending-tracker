import { StyleSheet } from "react-native";
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
  it("takes its height from the caller, to square off what it stands beside", async () => {
    await renderWithProviders(<DateRangePicker value={march} onChange={jest.fn()} height={58} />);
    const style = StyleSheet.flatten(screen.getByTestId("date-range-trigger").props.style);
    expect(style.height).toBe(58);
  });

  it("labels the range without a year", async () => {
    // The trigger is a compact control on a screen that states no year anywhere else.
    await renderWithProviders(<Harness initial={march} onChange={jest.fn()} />);
    // Scoped to the trigger: the sheet behind it stays mounted while closed and its custom
    // panel does state years, which is fine — it is a form, not a compact control.
    expect(screen.getByTestId("date-range-trigger")).not.toHaveTextContent(/2026/);
  });

  it("shows the current range on the trigger", async () => {
    await renderWithProviders(<Harness initial={march} onChange={jest.fn()} />);
    expect(screen.getByText("Mar 1–31")).toBeTruthy();
  });

  it("renders a single day as one date, not a range", async () => {
    // user-flow §8a makes single-day first-class; "Mar 2 – Mar 2" would read as a bug.
    await renderWithProviders(
      <Harness initial={{ start: "2026-03-02", end: "2026-03-02" }} onChange={jest.fn()} />,
    );
    expect(screen.getByText("Mar 2")).toBeTruthy();
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

    const lastMonth = rangePresets().find((p) => p.label === "Last month")!;
    await fireEvent.press(screen.getByTestId("preset-Last month"));

    expect(onChange).toHaveBeenCalledWith({ start: lastMonth.start, end: lastMonth.end });
  });
});

describe("the custom panel", () => {
  const value = { start: "2026-03-01", end: "2026-03-31" };

  async function openCustom() {
    await fireEvent.press(screen.getByTestId("date-range-trigger"));
    await fireEvent.press(screen.getByTestId("preset-Custom"));
  }

  it("states the range beside Custom once one has been set here", async () => {
    // March 2026 is not one of the presets, so this range can only have come from Custom.
    await renderWithProviders(<DateRangePicker value={value} onChange={jest.fn()} />);
    await fireEvent.press(screen.getByTestId("date-range-trigger"));

    expect(screen.getByTestId("preset-Custom")).toHaveTextContent(/1 – 31 Mar 2026/);
  });

  it("shows no date beside Custom when the range came from a preset", async () => {
    // Echoing the preset's dates there implied a custom range had been chosen when the user had
    // just tapped "This month".
    const thisMonth = rangePresets()[0];
    await renderWithProviders(
      <DateRangePicker value={{ start: thisMonth.start, end: thisMonth.end }} onChange={jest.fn()} />,
    );
    await fireEvent.press(screen.getByTestId("date-range-trigger"));

    // No digits at all means no date is being shown beside the label.
    expect(screen.getByTestId("preset-Custom")).not.toHaveTextContent(/\d/);
  });

  it("shows From and To with their dates in words, not raw ISO", async () => {
    await renderWithProviders(<DateRangePicker value={value} onChange={jest.fn()} />);
    await openCustom();

    expect(screen.getByTestId("custom-from")).toHaveTextContent(/From1 Mar 2026/);
    expect(screen.getByTestId("custom-to")).toHaveTextContent(/To31 Mar 2026/);
  });

  it("collects From first, then To — one field at a time", async () => {
    await renderWithProviders(<DateRangePicker value={value} onChange={jest.fn()} />);
    await openCustom();

    expect(screen.getByTestId("custom-from").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("custom-to").props.accessibilityState.selected).toBe(false);
  });

  it("does not commit a half-chosen range", async () => {
    // Committing after From alone refetches the screen behind the sheet against a range the
    // user hasn't finished describing.
    const onChange = jest.fn();
    await renderWithProviders(<DateRangePicker value={value} onChange={onChange} />);
    await openCustom();

    await fireEvent(screen.getByTestId("date-picker"), "change", {}, new Date(2026, 4, 2));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("advances to To after From is chosen", async () => {
    await renderWithProviders(<DateRangePicker value={value} onChange={jest.fn()} />);
    await openCustom();

    await fireEvent(screen.getByTestId("date-picker"), "change", {}, new Date(2026, 4, 2));

    expect(screen.getByTestId("custom-to").props.accessibilityState.selected).toBe(true);
  });

  it("commits and returns to the presets once both are chosen", async () => {
    const onChange = jest.fn();
    await renderWithProviders(<DateRangePicker value={value} onChange={onChange} />);
    await openCustom();

    await fireEvent(screen.getByTestId("date-picker"), "change", {}, new Date(2026, 4, 2));
    await fireEvent(screen.getByTestId("date-picker"), "change", {}, new Date(2026, 4, 20));

    expect(onChange).toHaveBeenCalledWith({ start: "2026-05-02", end: "2026-05-20" });
  });

  it("keeps the range coherent when From lands after To", async () => {
    // An inverted range reads as empty to the backend, so it must never be constructible.
    const onChange = jest.fn();
    await renderWithProviders(<DateRangePicker value={value} onChange={onChange} />);
    await openCustom();

    await fireEvent(screen.getByTestId("date-picker"), "change", {}, new Date(2026, 6, 15));
    await fireEvent(screen.getByTestId("date-picker"), "change", {}, new Date(2026, 6, 15));

    const [{ start, end }] = onChange.mock.calls[0];
    expect(start <= end).toBe(true);
  });

  it("keeps the range coherent when To lands before From", async () => {
    const onChange = jest.fn();
    await renderWithProviders(<DateRangePicker value={value} onChange={onChange} />);
    await openCustom();

    await fireEvent(screen.getByTestId("date-picker"), "change", {}, new Date(2026, 6, 15));
    await fireEvent(screen.getByTestId("date-picker"), "change", {}, new Date(2026, 5, 1));

    const [{ start, end }] = onChange.mock.calls[0];
    expect(start <= end).toBe(true);
  });

  it("can be backed out of without changing anything", async () => {
    const onChange = jest.fn();
    await renderWithProviders(<DateRangePicker value={value} onChange={onChange} />);
    await openCustom();

    await fireEvent.press(screen.getByTestId("custom-back"));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("preset-This month")).toBeTruthy();
  });
});

describe("preset rows show the span they resolve to", () => {
  it("collapses a same-month preset rather than repeating the month", async () => {
    await renderWithProviders(
      <DateRangePicker value={{ start: "2026-03-01", end: "2026-03-31" }} onChange={jest.fn()} />,
    );
    await fireEvent.press(screen.getByTestId("date-range-trigger"));

    // "1 – 31 Mar 2026", not "1 Mar 2026 – 31 Mar 2026".
    expect(screen.getByTestId("preset-This month")).toHaveTextContent(/1 – 31 \w{3} \d{4}/);
  });


  it("reads day-first, agreeing with the From/To fields below it", async () => {
    await renderWithProviders(
      <DateRangePicker value={{ start: "2026-03-01", end: "2026-03-31" }} onChange={jest.fn()} />,
    );
    await fireEvent.press(screen.getByTestId("date-range-trigger"));

    // Month-first ("Mar 1") would clash with "From 1 Mar 2026" directly underneath.
    expect(screen.getByTestId("preset-This month")).not.toHaveTextContent(/\w{3} \d{1,2} –/);
  });
});
