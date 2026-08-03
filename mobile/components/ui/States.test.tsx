import { EmptyState, ErrorState } from "@/components/ui";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

/**
 * user-flow §10 and CLAUDE.md's definition of done require empty and error states to be real,
 * reachable states — including their recovery action. These pin that the action actually fires,
 * since a retry button that renders but does nothing is the failure mode worth catching.
 */
describe("EmptyState", () => {
  it("renders the title and message", async () => {
    await renderWithProviders(
      <EmptyState title="No transactions" message="Scan a receipt to start." />,
    );
    expect(screen.getByText("No transactions")).toBeTruthy();
    expect(screen.getByText("Scan a receipt to start.")).toBeTruthy();
  });

  it("omits the action when no handler is supplied", async () => {
    await renderWithProviders(<EmptyState title="No transactions" actionLabel="Add one" />);
    expect(screen.queryByText("Add one")).toBeNull();
  });

  it("invokes the action when tapped", async () => {
    const onAction = jest.fn();
    await renderWithProviders(
      <EmptyState title="No transactions" actionLabel="Add one" onAction={onAction} />,
    );

    await fireEvent.press(screen.getByText("Add one"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorState", () => {
  it("shows a default title so a caller can't ship an untitled error", async () => {
    await renderWithProviders(<ErrorState />);
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("offers retry only when a handler is supplied, and calls it", async () => {
    const onRetry = jest.fn();
    const { rerender } = await renderWithProviders(<ErrorState message="Failed to fetch" />);
    expect(screen.queryByText("Try again")).toBeNull();

    await rerender(<ErrorState message="Failed to fetch" onRetry={onRetry} />);
    await fireEvent.press(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
