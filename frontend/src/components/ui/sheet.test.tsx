import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sheet, SheetRow } from "./sheet";

function renderSheet(props: Partial<Parameters<typeof Sheet>[0]> = {}) {
  return render(
    <Sheet open onOpenChange={() => {}} title="Date range" {...props}>
      <SheetRow onClick={() => {}}>This month</SheetRow>
    </Sheet>,
  );
}

/** The sheet panel — Radix marks it with role=dialog. */
function panel(): HTMLElement {
  return screen.getByRole("dialog");
}

describe("Sheet", () => {
  it("renders its title, description and children", () => {
    renderSheet({ description: "$42.10" });
    expect(screen.getByText("Date range")).toBeInTheDocument();
    expect(screen.getByText("$42.10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "This month" })).toBeInTheDocument();
  });

  it("animates in and out over the same duration, easing and fade amount", () => {
    renderSheet();
    const cls = panel().className;

    // Symmetry is the point: every open/closed pair must mirror.
    expect(cls).toContain("data-[state=open]:fade-in-50");
    expect(cls).toContain("data-[state=closed]:fade-out-50");
    expect(cls).toContain("data-[state=open]:slide-in-from-bottom");
    expect(cls).toContain("data-[state=closed]:slide-out-to-bottom");
    // One duration and one easing, shared by both directions.
    expect(cls).toContain("duration-[400ms]");
    expect(cls).toContain("ease-[cubic-bezier(0.32,0.72,0,1)]");
  });

  it("never grows taller than the screen — the body scrolls instead", () => {
    renderSheet();
    expect(panel().className).toContain("max-h-[92svh]");
    expect(
      panel().querySelector(".overflow-y-auto"),
      "the sheet body should scroll",
    ).not.toBeNull();
  });

  it("shows a back button only when onBack is given", () => {
    const onBack = vi.fn();
    const { unmount } = renderSheet();
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
    unmount();

    renderSheet({ onBack });
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    renderSheet({ onOpenChange });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
