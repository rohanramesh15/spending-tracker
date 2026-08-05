import HomeScreen from "@/app/(tabs)/index";
import { fireEvent, mutation, query, renderScreen, screen } from "@/test-screen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");

const mockHooks = {
  useSpending: jest.fn(),
  useTransactions: jest.fn(),
  useReviews: jest.fn(),
  useNotifications: jest.fn(),
  useTransaction: jest.fn(),
  useDeleteTransaction: jest.fn(),
  useUpdateTransaction: jest.fn(),
  useSetTransactionHidden: jest.fn(),
};
jest.mock("@shared/api/hooks", () => ({
  useSpending: () => mockHooks.useSpending(),
  useTransactions: () => mockHooks.useTransactions(),
  useReviews: () => mockHooks.useReviews(),
  useNotifications: () => mockHooks.useNotifications(),
  // Home offers the same row actions as the Transactions tab, via useTransactionActions.
  useTransaction: () => mockHooks.useTransaction(),
  useDeleteTransaction: () => mockHooks.useDeleteTransaction(),
  useUpdateTransaction: () => mockHooks.useUpdateTransaction(),
  useSetTransactionHidden: () => mockHooks.useSetTransactionHidden(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useSpending.mockReturnValue(query({ data: { total_cents: 0, slices: [] } }));
  mockHooks.useTransactions.mockReturnValue(query({ data: [] }));
  mockHooks.useReviews.mockReturnValue(query({ data: [] }));
  mockHooks.useNotifications.mockReturnValue(query({ data: [] }));
  mockHooks.useTransaction.mockReturnValue(query({ data: undefined }));
  mockHooks.useDeleteTransaction.mockReturnValue(mutation());
  mockHooks.useUpdateTransaction.mockReturnValue(mutation());
  mockHooks.useSetTransactionHidden.mockReturnValue(mutation());
});

describe("HomeScreen", () => {
  it("shows the spending total for the range", async () => {
    mockHooks.useSpending.mockReturnValue(
      query({ data: { total_cents: 123456, slices: [{ category: "Shopping", cents: 123456 }] } }),
    );
    await renderScreen(<HomeScreen />);
    expect(screen.getByText("$1,234.56")).toBeTruthy();
  });

  it("shows a chart skeleton while spending loads", async () => {
    mockHooks.useSpending.mockReturnValue(query({ isLoading: true }));
    await renderScreen(<HomeScreen />);
    expect(screen.getByTestId("chart-skeleton")).toBeTruthy();
  });

  it("shows an error state when spending fails", async () => {
    mockHooks.useSpending.mockReturnValue(query({ isError: true }));
    await renderScreen(<HomeScreen />);
    expect(screen.getByText("Couldn't load your spending.")).toBeTruthy();
  });

  it("invites a first purchase when the range is empty", async () => {
    await renderScreen(<HomeScreen />);
    expect(screen.getByText("Nothing tracked in this range")).toBeTruthy();
  });

  it("hides the review banner when the queue is empty", async () => {
    await renderScreen(<HomeScreen />);
    expect(screen.queryByText(/need review/)).toBeNull();
  });

  it("banners a non-empty review queue and links to it", async () => {
    mockHooks.useReviews.mockReturnValue(query({ data: [{ id: "r1" }, { id: "r2" }] }));
    await renderScreen(<HomeScreen />);

    const banner = screen.getByText("2 transactions need review");
    expect(banner).toBeTruthy();
    await fireEvent.press(banner);
    expect(mockPush).toHaveBeenCalledWith("/review");
  });

  it("uses the singular for one review", async () => {
    mockHooks.useReviews.mockReturnValue(query({ data: [{ id: "r1" }] }));
    await renderScreen(<HomeScreen />);
    expect(screen.getByText("1 transaction needs review")).toBeTruthy();
  });

  it("banners unread subscription alerts", async () => {
    mockHooks.useNotifications.mockReturnValue(query({ data: [{ id: "n1" }] }));
    await renderScreen(<HomeScreen />);
    expect(screen.getByText("1 subscription alert")).toBeTruthy();
  });
});

describe("spending total", () => {
  it("labels the amount, so a bare number can't stand alone", async () => {
    await renderScreen(<HomeScreen />);
    expect(screen.getByText("Amount spent")).toBeTruthy();
  });
});

describe("header", () => {
  it("greets with a fixed Welcome, not a time-of-day line", async () => {
    // The greeting used to vary by hour and name the signed-in user; it is now constant, so no
    // part of the header depends on the clock or the session.
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 4, 23, 30));
    try {
      await renderScreen(<HomeScreen />);
      expect(screen.getByText("Welcome")).toBeTruthy();
      expect(screen.queryByText(/Still up|Good morning|Good evening/)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
