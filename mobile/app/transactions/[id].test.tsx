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
  });

  it("states the vendor and the total once each", async () => {
    // The vendor was in the page title AND the hero; the total was in the hero AND the summary's
    // Total row. On a one-item receipt that was half the screen repeating itself.
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getAllByText("Kroger")).toHaveLength(1);
    expect(screen.getAllByText("$42.12")).toHaveLength(1);
  });

  it("shows no breakdown when there is nothing to break down", async () => {
    mockHooks.useTransaction.mockReturnValue(
      query({ data: { ...detail, subtotal_cents: null, tax_cents: 0, tip_cents: 0 } }),
    );
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.queryByTestId("transaction-summary")).toBeNull();
  });

  it("leads with the amount, the vendor and the grouped sections", async () => {
    await renderScreen(<TransactionDetailScreen />);

    expect(screen.getByTestId("transaction-hero")).toBeTruthy();
    expect(screen.getByTestId("transaction-items")).toBeTruthy();
    expect(screen.getByTestId("transaction-summary")).toBeTruthy();
        // A single line item, counted in the section heading rather than repeated per row.
    expect(screen.getByText("1 item")).toBeTruthy();
  });

  it("keeps a way back out while loading, not just once loaded", async () => {
    // A header only on the happy path leaves a slow or failed load with no back button at all.
    mockHooks.useTransaction.mockReturnValue(query({ isLoading: true }));
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });

  it("keeps a way back out of a failed load", async () => {
    mockHooks.useTransaction.mockReturnValue(query({ isError: true }));
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getByLabelText("Back")).toBeTruthy();
  });

  it("shows a line item's category as a chip", async () => {
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getByTestId("category-chip-Food and Drinks")).toBeTruthy();
  });

  it("renders the local purchase date, not a UTC-shifted one", async () => {
    await renderScreen(<TransactionDetailScreen />);
    // Mar 2 2026 is a Monday; parsed as UTC it would render as Sunday, Mar 1. No year — the
    // list's day headings don't carry one either.
    expect(screen.getByText(/Monday, Mar 2/)).toBeTruthy();
    expect(screen.queryByText(/2026/)).toBeNull();
  });

  it("offers to itemize an unitemized transaction", async () => {
    mockHooks.useTransaction.mockReturnValue(query({ data: { ...detail, line_items: [] } }));
    await renderScreen(<TransactionDetailScreen />);
    expect(screen.getByText("No itemized detail")).toBeTruthy();
    expect(screen.getByText("Scan a receipt")).toBeTruthy();
  });
});
