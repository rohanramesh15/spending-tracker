import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SubscriptionsPage from "./SubscriptionsPage";
import {
  useSubscriptions,
  useRecomputeSubscriptions,
  useSetSubscriptionStatus,
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useSubscriptionSummary,
} from "@/api/hooks";
import type { AppNotification, Subscription, SubscriptionSummary } from "@/api/types";

vi.mock("@/api/hooks", () => ({
  useSubscriptions: vi.fn(),
  useRecomputeSubscriptions: vi.fn(),
  useSetSubscriptionStatus: vi.fn(),
  useNotifications: vi.fn(),
  useMarkNotificationRead: vi.fn(),
  useMarkAllNotificationsRead: vi.fn(),
  useSubscriptionSummary: vi.fn(),
}));

const mockUseSubscriptions = vi.mocked(useSubscriptions);
const mockUseRecompute = vi.mocked(useRecomputeSubscriptions);
const mockUseSetStatus = vi.mocked(useSetSubscriptionStatus);
const mockUseNotifications = vi.mocked(useNotifications);
const mockUseMarkRead = vi.mocked(useMarkNotificationRead);
const mockUseMarkAll = vi.mocked(useMarkAllNotificationsRead);
const mockUseSummary = vi.mocked(useSubscriptionSummary);

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "id-1",
    merchant: "netflix",
    display_name: "Netflix",
    type: null,
    amount_cents: 1599,
    cadence: "monthly",
    monthly_cost_cents: 1599,
    occurrences: 12,
    first_charged_on: "2026-01-15",
    last_charged_on: "2026-12-15",
    next_charge_on: "2027-01-15",
    confidence: 0.95,
    status: "detected",
    ...overrides,
  };
}

function asQuery(value: { data?: Subscription[]; isLoading: boolean }) {
  return value as unknown as ReturnType<typeof useSubscriptions>;
}

function asMutation(overrides: Record<string, unknown> = {}) {
  return { mutate: vi.fn(), isPending: false, variables: undefined, ...overrides } as unknown as ReturnType<
    typeof useSetSubscriptionStatus
  >;
}

function asNotifQuery(data: AppNotification[]) {
  return { data, isLoading: false } as unknown as ReturnType<typeof useNotifications>;
}

function asSummaryQuery(data?: SubscriptionSummary) {
  return { data, isLoading: false } as unknown as ReturnType<typeof useSubscriptionSummary>;
}

// The page links back to /earn, so it must render inside a router.
function renderPage() {
  return render(
    <MemoryRouter>
      <SubscriptionsPage />
    </MemoryRouter>,
  );
}

describe("SubscriptionsPage", () => {
  beforeEach(() => {
    mockUseSubscriptions.mockReset();
    mockUseRecompute.mockReset();
    mockUseSetStatus.mockReset();
    mockUseNotifications.mockReset();
    mockUseMarkRead.mockReset();
    mockUseMarkAll.mockReset();
    mockUseRecompute.mockReturnValue(
      asMutation() as unknown as ReturnType<typeof useRecomputeSubscriptions>,
    );
    mockUseSetStatus.mockReturnValue(asMutation());
    mockUseNotifications.mockReturnValue(asNotifQuery([]));
    mockUseMarkRead.mockReturnValue(asMutation() as unknown as ReturnType<typeof useMarkNotificationRead>);
    mockUseMarkAll.mockReturnValue(asMutation() as unknown as ReturnType<typeof useMarkAllNotificationsRead>);
    mockUseSummary.mockReturnValue(asSummaryQuery(undefined)); // insights render null by default
  });

  it("shows the empty state with a scan button when nothing is detected", () => {
    mockUseSubscriptions.mockReturnValue(asQuery({ data: [], isLoading: false }));
    renderPage();
    expect(screen.getByText("No subscriptions detected yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /scan transactions/i })).toBeInTheDocument();
  });

  it("rolls up the active monthly total and lists each subscription", () => {
    mockUseSubscriptions.mockReturnValue(
      asQuery({
        data: [
          sub({ id: "a", merchant: "netflix", display_name: "Netflix", monthly_cost_cents: 1599 }),
          sub({ id: "b", merchant: "spotify", display_name: "Spotify", monthly_cost_cents: 1099 }),
        ],
        isLoading: false,
      }),
    );
    renderPage();
    expect(screen.getByText("across 2 active subscriptions")).toBeInTheDocument();
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("Spotify")).toBeInTheDocument();
    expect(screen.getByText("$26.98")).toBeInTheDocument(); // 1599 + 1099
  });

  it("fires a status change when an action button is clicked", () => {
    const mutate = vi.fn();
    mockUseSetStatus.mockReturnValue(asMutation({ mutate }));
    mockUseSubscriptions.mockReturnValue(
      asQuery({ data: [sub({ id: "id-1", status: "detected" })], isLoading: false }),
    );
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(mutate).toHaveBeenCalledWith({ id: "id-1", status: "confirmed" });
  });

  it("excludes dismissed/cancelled from the active monthly total", () => {
    mockUseSubscriptions.mockReturnValue(
      asQuery({
        data: [
          sub({ id: "a", status: "confirmed", amount_cents: 1000, monthly_cost_cents: 1000 }),
          sub({ id: "b", status: "confirmed", amount_cents: 2000, monthly_cost_cents: 2000 }),
          sub({ id: "c", status: "cancelled", amount_cents: 9999, monthly_cost_cents: 9999 }),
        ],
        isLoading: false,
      }),
    );
    renderPage();
    // 2 active, total $30.00 — the $99.99 cancelled sub is counted in neither.
    expect(screen.getByText("across 2 active subscriptions")).toBeInTheDocument();
    expect(screen.getByText("$30.00")).toBeInTheDocument();
  });

  it("shows unread alerts and marks one read on dismiss", () => {
    const mutate = vi.fn();
    mockUseMarkRead.mockReturnValue(
      asMutation({ mutate }) as unknown as ReturnType<typeof useMarkNotificationRead>,
    );
    mockUseNotifications.mockReturnValue(
      asNotifQuery([
        {
          id: "n1",
          kind: "price_increased",
          subscription_id: "a",
          title: "Netflix went up in price",
          body: "$15.99 → $17.99.",
          read: false,
          created_at: "2026-07-18T00:00:00Z",
        },
      ]),
    );
    mockUseSubscriptions.mockReturnValue(asQuery({ data: [sub()], isLoading: false }));
    renderPage();
    expect(screen.getByText("Netflix went up in price")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss alert/i }));
    expect(mutate).toHaveBeenCalledWith("n1");
  });

  it("renders annualized insights and a duplicate-streaming savings hint", () => {
    mockUseSubscriptions.mockReturnValue(
      asQuery({
        data: [
          sub({ id: "a", merchant: "netflix", type: "streaming", monthly_cost_cents: 1599 }),
          sub({ id: "b", merchant: "hulu", type: "streaming", monthly_cost_cents: 1099 }),
        ],
        isLoading: false,
      }),
    );
    mockUseSummary.mockReturnValue(
      asSummaryQuery({
        total_monthly_cents: 2698,
        annualized_cents: 32376,
        active_count: 2,
        by_type: [{ type: "streaming", monthly_cents: 2698, count: 2 }],
        trend: [{ month: "2026-07", cents: 2698 }],
      }),
    );
    renderPage();
    expect(screen.getByText("$323.76")).toBeInTheDocument(); // annualized
    expect(screen.getByText(/2 streaming services/)).toBeInTheDocument();
  });
});
