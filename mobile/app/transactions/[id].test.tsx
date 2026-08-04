import TransactionDetailScreen from "@/app/transactions/[id]";
import { query, renderScreen, screen } from "@/test-screen";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: "t1" }),
}));

const mockHooks = { useTransaction: jest.fn() };
jest.mock("@shared/api/hooks", () => ({ useTransaction: () => mockHooks.useTransaction() }));

const detail = {
  id: "t1",
  vendor: "Kroger",
  purchased_on: "2026-03-02",
  source: "receipt",
  total_cents: 4212,
  currency: "USD",
  review_status: "confirmed",
  subtotal_cents: 3800,
  tax_cents: 212,
  tip_cents: 200,
  hidden: false,
  pending: false,
  line_items: [
    { id: "li1", raw_name: "MILK 2%", normalized_name: "milk, 2%", category_name: "Food and Drinks", price_cents: 349, hidden: false },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useTransaction.mockReturnValue(query({ data: detail }));
});

describe("TransactionDetailScreen", () => {
  it("shows a skeleton while loading", async () => {
    mockHooks.useTransaction.mockReturnValue(query({ isLoading: true }));
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getByTestId("list-skeleton")).toBeTruthy();
  });

  it("shows an error with a retry", async () => {
    mockHooks.useTransaction.mockReturnValue(query({ isError: true }));
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getByTestId("error-state")).toBeTruthy();
  });

  it("says so when the transaction is gone", async () => {
    mockHooks.useTransaction.mockReturnValue(query({ data: undefined }));
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getByText("Not found")).toBeTruthy();
  });

  it("prefers the normalized item name over the raw receipt text", async () => {
    // canonical_name is what recurring detection keys on (CLAUDE.md #10); showing it keeps the
    // UI honest about what the system actually recorded.
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getByText("milk, 2%")).toBeTruthy();
    expect(screen.queryByText("MILK 2%")).toBeNull();
  });

  it("breaks the total down into subtotal, tax and tip", async () => {
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getByText("$38.00")).toBeTruthy();
    expect(screen.getByText("$2.12")).toBeTruthy();
    expect(screen.getByText("$2.00")).toBeTruthy();
    expect(screen.getByText("$42.12")).toBeTruthy();
  });

  it("renders the local purchase date, not a UTC-shifted one", async () => {
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getByText(/Monday, Mar 2, 2026/)).toBeTruthy();
  });

  it("offers to itemize an unitemized transaction", async () => {
    mockHooks.useTransaction.mockReturnValue(query({ data: { ...detail, line_items: [] } }));
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getByText("No itemized detail")).toBeTruthy();
    expect(screen.getByText("Scan a receipt")).toBeTruthy();
  });
});
