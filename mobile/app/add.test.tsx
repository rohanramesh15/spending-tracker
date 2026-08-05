import ManualEntryScreen from "@/app/add";
import { fireEvent, mutation, query, renderScreen, screen, waitFor } from "@/test-screen";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: mockReplace }) }));

const mockHooks = { useIngest: jest.fn(), useCategories: jest.fn() };
jest.mock("@shared/api/hooks", () => ({
  useIngest: () => mockHooks.useIngest(),
  useCategories: () => mockHooks.useCategories(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useIngest.mockReturnValue(mutation({ mutateAsync: jest.fn().mockResolvedValue({ status: "created" }) }));
  mockHooks.useCategories.mockReturnValue(query({ data: [{ id: "c1", name: "Food and Drinks" }] }));
});

describe("ManualEntryScreen", () => {
  it("refuses to save without a vendor, and says why", async () => {
    await renderScreen(<ManualEntryScreen />);
    await fireEvent.press(screen.getByTestId("save"));
    expect(screen.getByTestId("entry-error")).toBeTruthy();
    expect(screen.getByText("Add a vendor.")).toBeTruthy();
  });

  it("requires a category in quick mode", async () => {
    await renderScreen(<ManualEntryScreen />);
    await fireEvent.changeText(screen.getByTestId("vendor"), "Kroger");
    await fireEvent.changeText(screen.getByTestId("total"), "42.12");
    await fireEvent.press(screen.getByTestId("save"));
    expect(screen.getByText("Pick a category.")).toBeTruthy();
  });

  it("submits a quick entry as integer cents through the ingest door", async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ status: "created" });
    mockHooks.useIngest.mockReturnValue(mutation({ mutateAsync }));

    await renderScreen(<ManualEntryScreen />);
    await fireEvent.changeText(screen.getByTestId("vendor"), "Kroger");
    await fireEvent.changeText(screen.getByTestId("total"), "42.12");
    await fireEvent.press(screen.getByTestId("category-select"));
    await fireEvent.press(screen.getByTestId("category-option-Food and Drinks"));
    await fireEvent.press(screen.getByTestId("save"));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ source: "manual", vendor: "Kroger", total_cents: 4212 }),
      ),
    );
  });

  it("shows a live derived total in itemized mode", async () => {
    await renderScreen(<ManualEntryScreen />);
    await fireEvent.press(screen.getByText("Itemized"));

    await fireEvent.changeText(screen.getByTestId("item-name-0"), "Milk");
    await fireEvent.changeText(screen.getByTestId("item-amount-0"), "3.49");
    await fireEvent.changeText(screen.getByTestId("tax"), "0.51");

    expect(screen.getByTestId("derived-total").props.children).toBe("$4.00");
  });

  it("asks rather than auto-merging when the save collides", async () => {
    // CLAUDE.md #5 — an attended collision must stop and ask, never merge silently.
    const mutateAsync = jest.fn().mockResolvedValue({
      status: "needs_decision",
      match: { matched_transaction_id: "x", vendor: "Kroger", purchased_on: "2026-03-02", total_cents: 4212, source: "plaid", item_count: 0 },
    });
    mockHooks.useIngest.mockReturnValue(mutation({ mutateAsync }));

    await renderScreen(<ManualEntryScreen />);
    await fireEvent.changeText(screen.getByTestId("vendor"), "Kroger");
    await fireEvent.changeText(screen.getByTestId("total"), "42.12");
    await fireEvent.press(screen.getByTestId("category-select"));
    await fireEvent.press(screen.getByTestId("category-option-Food and Drinks"));
    await fireEvent.press(screen.getByTestId("save"));

    await waitFor(() => expect(screen.getByTestId("reconcile-dialog")).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("surfaces a save failure instead of navigating away", async () => {
    const mutateAsync = jest.fn().mockRejectedValue(new Error("Server exploded"));
    mockHooks.useIngest.mockReturnValue(mutation({ mutateAsync }));

    await renderScreen(<ManualEntryScreen />);
    await fireEvent.changeText(screen.getByTestId("vendor"), "Kroger");
    await fireEvent.changeText(screen.getByTestId("total"), "42.12");
    await fireEvent.press(screen.getByTestId("category-select"));
    await fireEvent.press(screen.getByTestId("category-option-Food and Drinks"));
    await fireEvent.press(screen.getByTestId("save"));

    await waitFor(() => expect(screen.getByText("Server exploded")).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
