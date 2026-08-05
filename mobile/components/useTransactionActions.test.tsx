import type { TransactionListItem } from "@shared/api/types";
import { useTransactionActions } from "@/components/useTransactionActions";
import { fireEvent, mutation, query, renderScreen, screen, waitFor } from "@/test-screen";

const mockHooks = {
  useTransaction: jest.fn(),
  useDeleteTransaction: jest.fn(),
  useUpdateTransaction: jest.fn(),
  useSetTransactionHidden: jest.fn(),
};
jest.mock("@shared/api/hooks", () => ({
  useTransaction: () => mockHooks.useTransaction(),
  useDeleteTransaction: () => mockHooks.useDeleteTransaction(),
  useUpdateTransaction: () => mockHooks.useUpdateTransaction(),
  useSetTransactionHidden: () => mockHooks.useSetTransactionHidden(),
}));

function txn(overrides: Partial<TransactionListItem> = {}): TransactionListItem {
  return {
    id: "t1",
    vendor: "Kroger",
    purchased_on: "2026-03-02",
    source: "manual",
    total_cents: 4212,
    currency: "USD",
    review_status: "confirmed",
    item_count: 2,
    categories: [],
    tax_cents: 0,
    tip_cents: 0,
    hidden: false,
    pending: false,
    ...overrides,
  };
}

/** Mounts the hook behind a button that opens the menu for `item`. */
function Harness({ item }: { item: TransactionListItem }) {
  const actions = useTransactionActions();
  return (
    <>
      <Opener onPress={() => actions.openMenu(item)} />
      {actions.overlays}
    </>
  );
}

function Opener({ onPress }: { onPress: () => void }) {
  const { Button } = require("@/components/ui") as typeof import("@/components/ui");
  return (
    <Button testID="open" onPress={onPress}>
      Open
    </Button>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useTransaction.mockReturnValue(query({ data: undefined }));
  mockHooks.useDeleteTransaction.mockReturnValue(mutation());
  mockHooks.useUpdateTransaction.mockReturnValue(mutation());
  mockHooks.useSetTransactionHidden.mockReturnValue(mutation());
});

/**
 * Home and the Transactions tab share this hook. These pin the behaviour both screens rely on —
 * before it existed each maintained its own copy, which is how two screens quietly stop
 * agreeing about what "Delete" does.
 */
describe("useTransactionActions", () => {
  it("names the transaction it is acting on", async () => {
    await renderScreen(<Harness item={txn()} />);
    await fireEvent.press(screen.getByTestId("open"));

    expect(screen.getByText("Kroger")).toBeTruthy();
    expect(screen.getByText("$42.12")).toBeTruthy();
  });

  it("offers edit, hide and delete", async () => {
    await renderScreen(<Harness item={txn()} />);
    await fireEvent.press(screen.getByTestId("open"));

    expect(screen.getByTestId("action-edit")).toBeTruthy();
    expect(screen.getByTestId("action-hide")).toBeTruthy();
    expect(screen.getByTestId("action-delete")).toBeTruthy();
  });

  it("offers to unhide a transaction that is already hidden", async () => {
    await renderScreen(<Harness item={txn({ hidden: true })} />);
    await fireEvent.press(screen.getByTestId("open"));

    expect(screen.getByText("Unhide from spending")).toBeTruthy();
  });

  it("hides a transaction without asking, since it is reversible", async () => {
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    mockHooks.useSetTransactionHidden.mockReturnValue(mutation({ mutateAsync }));

    await renderScreen(<Harness item={txn()} />);
    await fireEvent.press(screen.getByTestId("open"));
    await fireEvent.press(screen.getByTestId("action-hide"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: "t1", hidden: true }));
  });

  it("explains hiding without hiding anything", async () => {
    // The info button sits inside the hide row. A nested pressable must consume the tap — if it
    // bubbled, asking what hiding does would hide the transaction.
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    mockHooks.useSetTransactionHidden.mockReturnValue(mutation({ mutateAsync }));

    await renderScreen(<Harness item={txn()} />);
    await fireEvent.press(screen.getByTestId("open"));
    await fireEvent.press(screen.getByTestId("action-hide-info"));

    expect(screen.getByTestId("hide-explainer")).toBeTruthy();
    expect(screen.getByText(/drops off the chart/)).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("does NOT delete on the first tap — deleting is irreversible", async () => {
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    mockHooks.useDeleteTransaction.mockReturnValue(mutation({ mutateAsync }));

    await renderScreen(<Harness item={txn()} />);
    await fireEvent.press(screen.getByTestId("open"));
    await fireEvent.press(screen.getByTestId("action-delete"));

    expect(mutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Delete transaction?")).toBeTruthy());
  });

  it("deletes once the confirmation is accepted", async () => {
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    mockHooks.useDeleteTransaction.mockReturnValue(mutation({ mutateAsync }));

    await renderScreen(<Harness item={txn()} />);
    await fireEvent.press(screen.getByTestId("open"));
    await fireEvent.press(screen.getByTestId("action-delete"));
    await waitFor(() => expect(screen.getByText("Delete transaction?")).toBeTruthy());
    await fireEvent.press(screen.getByText("Delete"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("t1"));
  });

  it("names the transaction in the confirmation, so the wrong row can't be deleted blind", async () => {
    await renderScreen(<Harness item={txn({ vendor: "Trader Joe's" })} />);
    await fireEvent.press(screen.getByTestId("open"));
    await fireEvent.press(screen.getByTestId("action-delete"));

    await waitFor(() => expect(screen.getByText(/Trader Joe's/)).toBeTruthy());
  });
});
