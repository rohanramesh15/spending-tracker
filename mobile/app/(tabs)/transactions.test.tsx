import TransactionsScreen from "@/app/(tabs)/transactions";
import type { TransactionListItem } from "@shared/api/types";
import { fireEvent, mutation, query, renderScreen, screen } from "@/test-screen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

const mockHooks = {
  useTransactions: jest.fn(),
  useTransaction: jest.fn(),
  useDeleteTransaction: jest.fn(),
  useUpdateTransaction: jest.fn(),
  useSetTransactionHidden: jest.fn(),
};
jest.mock("@shared/api/hooks", () => ({
  useTransactions: () => mockHooks.useTransactions(),
  useTransaction: () => mockHooks.useTransaction(),
  useDeleteTransaction: () => mockHooks.useDeleteTransaction(),
  useUpdateTransaction: () => mockHooks.useUpdateTransaction(),
  useSetTransactionHidden: () => mockHooks.useSetTransactionHidden(),
  // Inlined rather than using the `query` helper: a jest.mock factory is hoisted above the
  // imports, so it can't reference out-of-scope variables.
  useCategories: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn() }),
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
    hidden: false,
    pending: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useTransactions.mockReturnValue(query({ data: [txn()] }));
  mockHooks.useTransaction.mockReturnValue(query());
  mockHooks.useDeleteTransaction.mockReturnValue(mutation());
  mockHooks.useUpdateTransaction.mockReturnValue(mutation());
  mockHooks.useSetTransactionHidden.mockReturnValue(mutation());
});

describe("TransactionsScreen", () => {
  it("shows a skeleton while loading", async () => {
    mockHooks.useTransactions.mockReturnValue(query({ isLoading: true }));
    await renderScreen(<TransactionsScreen />);
    expect(screen.getByTestId("list-skeleton")).toBeTruthy();
  });

  it("shows an error with a retry", async () => {
    mockHooks.useTransactions.mockReturnValue(query({ isError: true }));
    await renderScreen(<TransactionsScreen />);
    expect(screen.getByTestId("error-state")).toBeTruthy();
  });

  it("shows an empty state with a way out", async () => {
    mockHooks.useTransactions.mockReturnValue(query({ data: [] }));
    await renderScreen(<TransactionsScreen />);
    expect(screen.getByText("No transactions yet")).toBeTruthy();
  });

  it("groups transactions under a day heading", async () => {
    await renderScreen(<TransactionsScreen />);
    expect(screen.getByText("Monday, Mar 2")).toBeTruthy();
    expect(screen.getByText("Kroger")).toBeTruthy();
  });

  it("hides the review filter when nothing needs review", async () => {
    // The control must not advertise a state that can't currently exist.
    await renderScreen(<TransactionsScreen />);
    expect(screen.queryByText(/Needs review/)).toBeNull();
  });

  it("offers the review filter when a queue exists, and filters to it", async () => {
    mockHooks.useTransactions.mockReturnValue(
      query({
        data: [txn(), txn({ id: "t2", vendor: "Target", review_status: "needs_review" })],
      }),
    );

    await renderScreen(<TransactionsScreen />);
    expect(screen.getByText("Needs review (1)")).toBeTruthy();
    expect(screen.getByText("Kroger")).toBeTruthy();

    await fireEvent.press(screen.getByText("Needs review (1)"));
    expect(screen.getByText("Target")).toBeTruthy();
    expect(screen.queryByText("Kroger")).toBeNull();
  });

  it("opens the detail screen on tap", async () => {
    await renderScreen(<TransactionsScreen />);
    await fireEvent.press(screen.getByTestId("transaction-row-t1"));
    expect(mockPush).toHaveBeenCalledWith("/transactions/t1");
  });

  it("opens the action sheet on long press rather than navigating", async () => {
    await renderScreen(<TransactionsScreen />);
    await fireEvent(screen.getByTestId("transaction-row-t1"), "longPress");

    expect(screen.getByTestId("action-delete")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("requires confirmation before deleting", async () => {
    // Delete must never fire straight off the action sheet.
    const mutateAsync = jest.fn();
    mockHooks.useDeleteTransaction.mockReturnValue(mutation({ mutateAsync }));

    await renderScreen(<TransactionsScreen />);
    await fireEvent(screen.getByTestId("transaction-row-t1"), "longPress");
    await fireEvent.press(screen.getByTestId("action-delete"));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Delete transaction?")).toBeTruthy();
  });
});
