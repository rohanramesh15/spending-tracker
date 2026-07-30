import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DateRangePicker, type DateRangeValue } from "./DateRangePicker";
import { rangePresets, formatRangeLabel } from "@/lib/dates";

const presets = rangePresets();
const thisMonth = presets[0];
const lastMonth = presets[1];

function setup(value: DateRangeValue = { start: thisMonth.start, end: thisMonth.end }) {
  const onChange = vi.fn();
  render(<DateRangePicker value={value} onChange={onChange} />);
  return { onChange };
}

describe("DateRangePicker", () => {
  it("labels the trigger with the active preset", () => {
    setup();
    expect(screen.getByRole("button", { name: /this month/i })).toBeInTheDocument();
  });

  it("labels the trigger with explicit dates for a custom range", () => {
    setup({ start: "2026-03-03", end: "2026-04-01" });
    expect(
      screen.getByRole("button", { name: formatRangeLabel("2026-03-03", "2026-04-01") }),
    ).toBeInTheDocument();
  });

  it("opens a bottom sheet of presets and commits the tapped one", async () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /this month/i }));

    expect(await screen.findByText("Date range")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Last month/i }));

    expect(onChange).toHaveBeenCalledWith({
      start: lastMonth.start,
      end: lastMonth.end,
    });
    // Sheet closes after a selection.
    await waitFor(() => expect(screen.queryByText("Date range")).not.toBeInTheDocument());
  });

  it("pushes to a calendar view for a custom range and only commits on Apply", async () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /this month/i }));
    fireEvent.click(await screen.findByRole("button", { name: /custom range/i }));

    expect(await screen.findByText("Custom range")).toBeInTheDocument();
    expect(screen.getByRole("grid")).toBeInTheDocument();

    // Picking a day alone must not fire onChange — Apply is the commit.
    const day = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.trim() === "15" && b.closest("table"));
    expect(day).toBeDefined();
    fireEvent.click(day!);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("can go back from the calendar to the preset list", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /this month/i }));
    fireEvent.click(await screen.findByRole("button", { name: /custom range/i }));
    fireEvent.click(screen.getByRole("button", { name: /back to presets/i }));
    expect(await screen.findByText("Date range")).toBeInTheDocument();
  });
});
