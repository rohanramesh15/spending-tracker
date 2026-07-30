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
    // One duration and one easing token, shared by both directions. These are theme
    // tokens on purpose — the arbitrary-value forms generate no CSS, which shipped a
    // sheet that animated at the plugin's default timing.
    expect(cls).toContain("duration-sheet");
    expect(cls).toContain("ease-sheet");
  });

  /**
   * Regression: the motion classes were once written as arbitrary values
   * (`duration-[400ms]`, `ease-[cubic-bezier(...)]`). Tailwind generated NO rule for
   * either, so the sheet shipped animating at the plugin's default timing while a
   * class-name assertion happily passed. Pin the timing to theme tokens that exist.
   */
  it("takes its timing from theme tokens, not arbitrary values", async () => {
    renderSheet();
    const cls = panel().className;
    expect(cls).not.toMatch(/duration-\[/);
    expect(cls).not.toMatch(/ease-\[/);

    const { default: config } = await import("../../../tailwind.config");
    const extend = config.theme?.extend as {
      transitionDuration?: Record<string, string>;
      transitionTimingFunction?: Record<string, string>;
    };
    expect(extend.transitionDuration?.sheet).toBe("400ms");
    expect(extend.transitionTimingFunction?.sheet).toMatch(/^cubic-bezier\(/);
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
