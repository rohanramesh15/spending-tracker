import type { TransactionDetail } from "@shared/api/types";
import { EditTransactionDialog } from "@/components/EditTransactionDialog";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

function detail(overrides: Partial<TransactionDetail> = {}): TransactionDetail {
  return {
    id: "t1",
    vendor: "Kroger",
    purchased_on: "2026-03-02",
    source: "manual",
    total_cents: 4212,
    currency: "USD",
    review_status: "confirmed",
    subtotal_cents: 3800,
    tax_cents: 212,
    tip_cents: 200,
    hidden: false,
    pending: false,
    line_items: [],
    ...overrides,
  } as TransactionDetail;
}

describe("EditTransactionDialog", () => {
  it("rules off the title, like every other pop-up in the app", async () => {
    await renderWithProviders(
      <EditTransactionDialog open txn={detail()} onOpenChange={jest.fn()} onSave={jest.fn()} />,
    );
    expect(screen.getByTestId("edit-title-separator")).toBeTruthy();
  });

  it("prefills from the transaction", async () => {
    await renderWithProviders(
      <EditTransactionDialog open txn={detail()} onOpenChange={jest.fn()} onSave={jest.fn()} />,
    );

    expect(screen.getByTestId("edit-vendor").props.value).toBe("Kroger");
    expect(screen.getByTestId("edit-date").props.value).toBe("2026-03-02");
    // Cents are rendered as dollars only at the edge (CLAUDE.md #1).
    expect(screen.getByTestId("edit-tax").props.value).toBe("2.12");
  });

  it("saves dollars back as integer cents", async () => {
    const onSave = jest.fn();
    await renderWithProviders(
      <EditTransactionDialog open txn={detail()} onOpenChange={jest.fn()} onSave={onSave} />,
    );

    await fireEvent.changeText(screen.getByTestId("edit-tax"), "3.50");
    await fireEvent.press(screen.getByTestId("edit-save"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ vendor: "Kroger", purchased_on: "2026-03-02", tax_cents: 350 }),
    );
  });

  it("hides tax and tip for an unitemized transaction", async () => {
    // Without a line-item subtotal there's no separable principal to add tax/tip to, and the
    // API ignores them — showing the fields would imply an edit that never happens.
    await renderWithProviders(
      <EditTransactionDialog
        open
        txn={detail({ subtotal_cents: null })}
        onOpenChange={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    expect(screen.queryByTestId("edit-tax")).toBeNull();
    expect(screen.queryByTestId("edit-tip")).toBeNull();
  });

  it("sends zeroed tax and tip for an unitemized transaction", async () => {
    const onSave = jest.fn();
    await renderWithProviders(
      <EditTransactionDialog
        open
        txn={detail({ subtotal_cents: null })}
        onOpenChange={jest.fn()}
        onSave={onSave}
      />,
    );

    await fireEvent.press(screen.getByTestId("edit-save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tax_cents: 0, tip_cents: 0 }));
  });

  it("refuses to save without a vendor", async () => {
    const onSave = jest.fn();
    await renderWithProviders(
      <EditTransactionDialog open txn={detail()} onOpenChange={jest.fn()} onSave={onSave} />,
    );

    await fireEvent.changeText(screen.getByTestId("edit-vendor"), "   ");
    await fireEvent.press(screen.getByTestId("edit-save"));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("never sends NaN when a money field is unparseable", async () => {
    const onSave = jest.fn();
    await renderWithProviders(
      <EditTransactionDialog open txn={detail()} onOpenChange={jest.fn()} onSave={onSave} />,
    );

    await fireEvent.changeText(screen.getByTestId("edit-tip"), "abc");
    await fireEvent.press(screen.getByTestId("edit-save"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tip_cents: 0 }));
  });
});
