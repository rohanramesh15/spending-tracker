import type { ReconcileMatch } from "@shared/api/types";
import { ReconcileDialog } from "@/components/ReconcileDialog";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

const match: ReconcileMatch = {
  matched_transaction_id: "existing-1",
  vendor: "Kroger",
  purchased_on: "2026-03-02",
  total_cents: 4212,
  source: "plaid",
  item_count: 0,
} as ReconcileMatch;

const incoming = { vendor: "Kroger", total_cents: 4212 };

/**
 * CLAUDE.md #5 — never auto-merge. This dialog is the attended half of that rule: when a save
 * collides, the user must choose. These tests pin that all four outcomes are offered and that
 * none of them is taken implicitly.
 */
describe("ReconcileDialog", () => {
  it("stays closed when there is no match", async () => {
    await renderWithProviders(
      <ReconcileDialog match={null} incoming={incoming} onResolve={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(screen.queryByTestId("reconcile-dialog")).toBeNull();
  });

  it("shows both sides so the user can tell the purchases apart", async () => {
    await renderWithProviders(
      <ReconcileDialog match={match} incoming={incoming} onResolve={jest.fn()} onCancel={jest.fn()} />,
    );

    expect(screen.getByText("Existing")).toBeTruthy();
    expect(screen.getByText("Adding now")).toBeTruthy();
    expect(screen.getByText(/bank transaction/)).toBeTruthy();
    expect(screen.getByText("Mar 2, 2026")).toBeTruthy();
  });

  it.each([
    ["resolve-merge", "merge"],
    ["resolve-keep_both", "keep_both"],
    ["resolve-replace", "replace"],
    ["resolve-skip", "skip"],
  ])("offers %s and reports it", async (testID, resolution) => {
    const onResolve = jest.fn();
    await renderWithProviders(
      <ReconcileDialog match={match} incoming={incoming} onResolve={onResolve} onCancel={jest.fn()} />,
    );

    await fireEvent.press(screen.getByTestId(testID));
    expect(onResolve).toHaveBeenCalledWith(resolution);
  });

  it("resolves nothing on its own — no implicit merge", async () => {
    // The whole point of the never-auto-merge rule: rendering the dialog must not pick an
    // outcome, and there is no default that fires without a deliberate tap.
    const onResolve = jest.fn();
    await renderWithProviders(
      <ReconcileDialog match={match} incoming={incoming} onResolve={onResolve} onCancel={jest.fn()} />,
    );
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("disables every choice while a save is in flight", async () => {
    const onResolve = jest.fn();
    await renderWithProviders(
      <ReconcileDialog
        match={match}
        incoming={incoming}
        busy
        onResolve={onResolve}
        onCancel={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByTestId("resolve-merge"));
    expect(onResolve).not.toHaveBeenCalled();
  });
});
