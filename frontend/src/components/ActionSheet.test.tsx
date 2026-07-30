import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ActionSheet } from "./ActionSheet";

describe("ActionSheet", () => {
  it("shows the title, description and every action", () => {
    render(
      <ActionSheet
        open
        onOpenChange={() => {}}
        title="Trader Joe's"
        description="$42.10"
        actions={[
          { label: "Edit", onSelect: () => {} },
          { label: "Delete", onSelect: () => {}, destructive: true },
        ]}
      />,
    );
    expect(screen.getByText("Trader Joe's")).toBeInTheDocument();
    expect(screen.getByText("$42.10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "text-destructive",
    );
  });

  it("closes first, then runs the selected action", async () => {
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <ActionSheet
        open
        onOpenChange={onOpenChange}
        title="Trader Joe's"
        actions={[{ label: "Edit", onSelect }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Deferred a microtask so the next dialog doesn't fight this one for focus.
    expect(onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
  });

  it("does not fire a disabled action", () => {
    const onSelect = vi.fn();
    render(
      <ActionSheet
        open
        onOpenChange={() => {}}
        title="Trader Joe's"
        actions={[{ label: "Hide from spending", onSelect, disabled: true }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide from spending" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
