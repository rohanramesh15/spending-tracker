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

/** Open the sheet and push to the custom-range step. */
async function openCustom() {
  fireEvent.click(screen.getAllByRole("button")[0]);
  fireEvent.click(await screen.findByRole("button", { name: /custom range/i }));
  expect(await screen.findByText("Custom range")).toBeInTheDocument();
}

/** The "Starting"/"Ending" endpoint chip. */
function chip(name: RegExp): HTMLElement {
  return screen.getByRole("button", { name });
}

/** A day cell in the visible month (day buttons live inside the calendar table). */
function day(n: number): HTMLElement {
  const el = screen
    .getAllByRole("button")
    .find((b) => b.textContent?.trim() === String(n) && b.closest("table"));
  if (!el) throw new Error(`no day ${n} in the visible month`);
  return el;
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

  it("guides the custom range from the starting chip to the ending chip", async () => {
    const { onChange } = setup();
    await openCustom();

    // "Starting" is what the calendar edits first.
    expect(chip(/starting/i)).toHaveAttribute("aria-pressed", "true");
    expect(chip(/ending/i)).toHaveAttribute("aria-pressed", "false");

    // Picking a day fills Starting, then hands off to Ending — and commits nothing.
    fireEvent.click(day(10));
    expect(onChange).not.toHaveBeenCalled();
    expect(chip(/starting/i)).toHaveAttribute("aria-pressed", "false");
    expect(chip(/ending/i)).toHaveAttribute("aria-pressed", "true");
    expect(chip(/starting/i)).toHaveTextContent(/10, \d{4}$/);

    // The second pick fills Ending and stays put; Apply is the only commit.
    fireEvent.click(day(20));
    expect(onChange).not.toHaveBeenCalled();
    expect(chip(/ending/i)).toHaveTextContent(/20, \d{4}$/);

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const { start, end } = onChange.mock.calls[0][0] as DateRangeValue;
    expect(start.endsWith("-10")).toBe(true);
    expect(end.endsWith("-20")).toBe(true);
  });

  it("re-picking the start clears an end that now precedes it", async () => {
    setup();
    await openCustom();

    fireEvent.click(day(10));
    fireEvent.click(day(20)); // Ending = the 20th
    expect(chip(/ending/i)).toHaveTextContent(/20, \d{4}$/);

    // Move the start past it — the stale end is dropped rather than inverting the range.
    fireEvent.click(chip(/starting/i));
    fireEvent.click(day(25));
    expect(chip(/ending/i)).toHaveTextContent(/tap to pick/i);
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("can't pick an end date before the start", async () => {
    setup();
    await openCustom();

    fireEvent.click(day(15));
    // Now choosing the end: earlier days are disabled by the calendar.
    expect(day(14)).toBeDisabled();
    expect(day(16)).not.toBeDisabled();
  });

  it("can go back from the calendar to the preset list", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /this month/i }));
    fireEvent.click(await screen.findByRole("button", { name: /custom range/i }));
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(await screen.findByText("Date range")).toBeInTheDocument();
  });
});
