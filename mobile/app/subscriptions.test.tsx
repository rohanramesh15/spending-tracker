import SubscriptionsScreen from "@/app/subscriptions";
import { mutation, query, renderScreen, screen } from "@/test-screen";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));

const mockHooks = {
  useSubscriptions: jest.fn(),
  useSubscriptionSummary: jest.fn(),
  useRecomputeSubscriptions: jest.fn(),
  useSetSubscriptionStatus: jest.fn(),
};
jest.mock("@shared/api/hooks", () => ({
  useSubscriptions: () => mockHooks.useSubscriptions(),
  useSubscriptionSummary: () => mockHooks.useSubscriptionSummary(),
  useRecomputeSubscriptions: () => mockHooks.useRecomputeSubscriptions(),
  useSetSubscriptionStatus: () => mockHooks.useSetSubscriptionStatus(),
}));

const sub = {
  id: "s1",
  merchant: "netflix",
  display_name: "Netflix",
  type: null,
  amount_cents: 1599,
  cadence: "monthly",
  monthly_cost_cents: 1599,
  occurrences: 6,
  first_charged_on: "2025-10-02",
  last_charged_on: "2026-03-02",
  next_charge_on: "2026-04-02",
  confidence: 0.95,
  status: "detected",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useSubscriptions.mockReturnValue(query({ data: [] }));
  mockHooks.useSubscriptionSummary.mockReturnValue(query());
  mockHooks.useRecomputeSubscriptions.mockReturnValue(mutation());
  mockHooks.useSetSubscriptionStatus.mockReturnValue(mutation());
});

describe("SubscriptionsScreen", () => {
  it("shows a skeleton while loading", async () => {
    mockHooks.useSubscriptions.mockReturnValue(query({ isLoading: true }));
    await renderScreen(<SubscriptionsScreen />);
    expect(screen.getByTestId("list-skeleton")).toBeTruthy();
  });

  it("explains the empty state rather than showing a blank list", async () => {
    await renderScreen(<SubscriptionsScreen />);
    expect(screen.getByText("No subscriptions found")).toBeTruthy();
  });

  it("shows an error with a retry", async () => {
    mockHooks.useSubscriptions.mockReturnValue(query({ isError: true }));
    await renderScreen(<SubscriptionsScreen />);
    expect(screen.getByTestId("error-state")).toBeTruthy();
  });

  it("summarises monthly and annual cost", async () => {
    mockHooks.useSubscriptionSummary.mockReturnValue(
      query({ data: { total_monthly_cents: 4500, annualized_cents: 54000, active_count: 3, by_type: [], trend: [] } }),
    );
    await renderScreen(<SubscriptionsScreen />);
    expect(screen.getByText("$45.00")).toBeTruthy();
    expect(screen.getByText("$540.00")).toBeTruthy();
  });

  it("lists an active subscription with its cadence and next charge", async () => {
    mockHooks.useSubscriptions.mockReturnValue(query({ data: [sub] }));
    await renderScreen(<SubscriptionsScreen />);
    expect(screen.getByText("Netflix")).toBeTruthy();
    expect(screen.getByText(/monthly/)).toBeTruthy();
    expect(screen.getByText(/Apr 2/)).toBeTruthy();
  });

  it("excludes dismissed subscriptions from the active list", async () => {
    mockHooks.useSubscriptions.mockReturnValue(
      query({ data: [{ ...sub, id: "s2", display_name: "Ignored One", status: "dismissed" }] }),
    );
    await renderScreen(<SubscriptionsScreen />);
    expect(screen.queryByText("Ignored One")).toBeNull();
  });
});
