import { ConfirmDialog } from "@/components/ui";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

describe("ConfirmDialog", () => {
  it("stays closed when not open", async () => {
    await renderWithProviders(
      <ConfirmDialog open={false} onOpenChange={jest.fn()} title="Delete?" onConfirm={jest.fn()} />,
    );
    expect(screen.queryByText("Delete?")).toBeNull();
  });

  it("shows the title and description", async () => {
    await renderWithProviders(
      <ConfirmDialog
        open
        onOpenChange={jest.fn()}
        title="Delete transaction?"
        description="Can't be undone."
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByText("Delete transaction?")).toBeTruthy();
    expect(screen.getByText("Can't be undone.")).toBeTruthy();
  });

  it("rules off the title, like every other pop-up in the app", async () => {
    await renderWithProviders(
      <ConfirmDialog
        open
        onOpenChange={jest.fn()}
        title="Delete transaction?"
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByTestId("dialog-title-separator")).toBeTruthy();
  });

  it("confirms only on a deliberate tap", async () => {
    // A destructive dialog must never act merely by appearing.
    const onConfirm = jest.fn();
    await renderWithProviders(
      <ConfirmDialog open onOpenChange={jest.fn()} title="Delete?" onConfirm={onConfirm} />,
    );
    expect(onConfirm).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("lets the caller relabel the confirm action", async () => {
    const onConfirm = jest.fn();
    await renderWithProviders(
      <ConfirmDialog
        open
        onOpenChange={jest.fn()}
        title="Sign out?"
        confirmLabel="Sign out"
        onConfirm={onConfirm}
      />,
    );

    await fireEvent.press(screen.getByText("Sign out"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("offers a cancel that does not confirm", async () => {
    const onConfirm = jest.fn();
    await renderWithProviders(
      <ConfirmDialog open onOpenChange={jest.fn()} title="Delete?" onConfirm={onConfirm} />,
    );

    await fireEvent.press(screen.getByText("Cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
