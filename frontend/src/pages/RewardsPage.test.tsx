import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import RewardsPage from "./RewardsPage";
import type { Card, RewardProfile, RewardsOptimization } from "@/api/types";

const matchedCard: Card = {
  id: "c1",
  institution: "American Express",
  name: "Blue Cash Everyday",
  mask: "1111",
  subtype: "credit card",
  reward_profile_key: "amex_blue_cash_everyday",
  reward_profile_source: "matched",
  reward_profile_name: "Amex Blue Cash Everyday",
  needs_confirmation: false,
};
const unmatchedCard: Card = {
  id: "c2",
  institution: "Some Bank",
  name: "Mystery Visa",
  mask: "3333",
  subtype: "credit card",
  reward_profile_key: null,
  reward_profile_source: null,
  reward_profile_name: null,
  needs_confirmation: true,
};

const profiles: RewardProfile[] = [
  {
    key: "citi_double_cash",
    display_name: "Citi Double Cash",
    issuer: "Citi",
    base_rate: 0.02,
    category_rates: {},
    points_value_cents: 1,
    verified: false,
    notes: null,
  },
];

function optimization(overrides: Partial<RewardsOptimization> = {}): RewardsOptimization {
  return {
    window_days: 90,
    cards: [matchedCard, unmatchedCard],
    recommendations: [
      {
        reward_category: "groceries",
        spend_cents: 20000,
        annualized_spend_cents: 81000,
        best_card_key: "amex_blue_cash_everyday",
        best_card_name: "Amex Blue Cash Everyday",
        best_rate: 0.03,
        est_annual_reward_cents: 2430,
        current_card_name: null,
        current_rate: null,
        est_annual_missed_cents: null,
      },
    ],
    total_est_annual_reward_cents: 2430,
    total_missed_annual_cents: null,
    unmatched_card_count: 1,
    top_move: "Use Amex Blue Cash Everyday for groceries (~$24/yr in rewards)",
    points_assumption_note: "Rates assume 1¢ per point.",
    spend_scope_note: "Estimated from all synced bank/card spend in this window.",
    ...overrides,
  };
}

let optData: RewardsOptimization;
let cardData: Card[];

beforeEach(() => {
  optData = optimization();
  cardData = [matchedCard, unmatchedCard];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      let body: unknown = null;
      if (u.includes("/api/rewards/optimization")) body = optData;
      else if (u.includes("/api/rewards/profiles")) body = profiles;
      else if (u.includes("/api/cards")) body = cardData;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(""),
      } as Response);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RewardsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RewardsPage", () => {
  it("shows the best card per category, the top move, and the confirm prompt", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Groceries")).toBeInTheDocument());
    // best card + rate in the recommendations table
    expect(screen.getAllByText("Amex Blue Cash Everyday").length).toBeGreaterThan(0);
    expect(screen.getByText("3.0%")).toBeInTheDocument();
    // top move banner
    expect(screen.getByText(/Use Amex Blue Cash Everyday for groceries/)).toBeInTheDocument();
    // one unmatched card → confirm prompt + a picker
    expect(screen.getByText("Confirm 1 card")).toBeInTheDocument();
    expect(screen.getByLabelText("Reward profile for Mystery Visa")).toBeInTheDocument();
    // honesty caveat surfaced
    expect(screen.getByText(/Rates assume 1¢ per point/)).toBeInTheDocument();
  });

  it("flips to a 'left on the table' headline when v2 missed rewards are present", async () => {
    optData = optimization({
      total_missed_annual_cents: 1200,
      recommendations: [
        {
          reward_category: "groceries",
          spend_cents: 50000,
          annualized_spend_cents: 200000,
          best_card_key: "amex_blue_cash_everyday",
          best_card_name: "Amex Blue Cash Everyday",
          best_rate: 0.03,
          est_annual_reward_cents: 6000,
          current_card_name: "Citi Double Cash",
          current_rate: 0.02,
          est_annual_missed_cents: 1200,
        },
      ],
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/left on the table/i)).toBeInTheDocument(),
    );
    // per-row current card + missed amount
    expect(screen.getByText(/on Citi Double Cash · missing/)).toBeInTheDocument();
  });

  it("shows an empty state when the user has no cards", async () => {
    optData = optimization({
      cards: [],
      recommendations: [],
      top_move: null,
      unmatched_card_count: 0,
    });
    cardData = [];
    renderPage();

    await waitFor(() => expect(screen.getByText("No cards yet")).toBeInTheDocument());
    expect(screen.getByText("Connect an account")).toBeInTheDocument();
  });
});
