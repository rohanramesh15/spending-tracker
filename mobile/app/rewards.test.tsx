import RewardsScreen from "@/app/rewards";
import { query, renderScreen, screen } from "@/test-screen";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));

const mockHooks = { useCards: jest.fn(), useRewardsOptimization: jest.fn() };
jest.mock("@shared/api/hooks", () => ({
  useCards: () => mockHooks.useCards(),
  useRewardsOptimization: () => mockHooks.useRewardsOptimization(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useCards.mockReturnValue(query({ data: [] }));
  mockHooks.useRewardsOptimization.mockReturnValue(query({ data: { recommendations: [] } }));
});

describe("RewardsScreen", () => {
  it("shows a skeleton while loading", async () => {
    mockHooks.useRewardsOptimization.mockReturnValue(query({ isLoading: true }));
    await renderScreen(<RewardsScreen />);
    expect(screen.getByTestId("list-skeleton")).toBeTruthy();
  });

  it("shows an error with a retry", async () => {
    mockHooks.useRewardsOptimization.mockReturnValue(query({ isError: true }));
    await renderScreen(<RewardsScreen />);
    expect(screen.getByTestId("error-state")).toBeTruthy();
  });

  it("explains why there are no recommendations yet", async () => {
    await renderScreen(<RewardsScreen />);
    expect(screen.getByText("No recommendations yet")).toBeTruthy();
  });

  it("annualises the payoff so the number is decision-sized", async () => {
    // A few cents per purchase is not actionable; the yearly figure is what decides a swap.
    mockHooks.useRewardsOptimization.mockReturnValue(
      query({
        data: {
          total_missed_annual_cents: 8400,
          recommendations: [
            { reward_category: "Groceries", spend_cents: 1000, annualized_spend_cents: 120000, best_card_name: "Amex Gold" },
          ],
        },
      }),
    );
    await renderScreen(<RewardsScreen />);

    expect(screen.getByText("$84.00")).toBeTruthy();
    expect(screen.getByText("$1,200.00/yr")).toBeTruthy();
    expect(screen.getByText("Best card: Amex Gold")).toBeTruthy();
  });

  it("lists connected cards and flags ones needing confirmation", async () => {
    mockHooks.useCards.mockReturnValue(
      query({
        data: [
          { id: "c1", institution: "Chase", name: "Freedom", mask: "1234", subtype: null, reward_profile_key: null, reward_profile_source: null, reward_profile_name: null, needs_confirmation: true },
        ],
      }),
    );
    await renderScreen(<RewardsScreen />);

    expect(screen.getByText("Freedom ••1234")).toBeTruthy();
    expect(screen.getByText("No reward profile set")).toBeTruthy();
    expect(screen.getByText("Confirm")).toBeTruthy();
  });
});
