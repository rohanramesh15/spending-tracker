import ReviewQueueScreen from "@/app/review";
import { mutation, query, renderScreen, screen } from "@/test-screen";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));

const mockHooks = { useReviews: jest.fn(), useResolveReview: jest.fn() };
jest.mock("@shared/api/hooks", () => ({
  useReviews: () => mockHooks.useReviews(),
  useResolveReview: () => mockHooks.useResolveReview(),
}));

const review = {
  id: "r1",
  reason: "Vendor and total match within a cent",
  incoming: { vendor: "Kroger", purchased_on: "2026-03-02", total_cents: 4212, source: "plaid", item_count: 0 },
  matched: { vendor: "Kroger", purchased_on: "2026-03-01", total_cents: 4212, source: "receipt", item_count: 7 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useReviews.mockReturnValue(query({ data: [] }));
  mockHooks.useResolveReview.mockReturnValue(mutation());
});

describe("ReviewQueueScreen", () => {
  it("shows a skeleton while loading", async () => {
    mockHooks.useReviews.mockReturnValue(query({ isLoading: true }));
    await renderScreen(<ReviewQueueScreen />);
    expect(screen.getByTestId("list-skeleton")).toBeTruthy();
  });

  it("says all caught up when the queue is empty", async () => {
    await renderScreen(<ReviewQueueScreen />);
    expect(screen.getByText("All caught up")).toBeTruthy();
  });

  it("shows an error with a retry", async () => {
    mockHooks.useReviews.mockReturnValue(query({ isError: true }));
    await renderScreen(<ReviewQueueScreen />);
    expect(screen.getByTestId("error-state")).toBeTruthy();
  });

  it("lists pending matches with a count", async () => {
    mockHooks.useReviews.mockReturnValue(query({ data: [review] }));
    await renderScreen(<ReviewQueueScreen />);
    expect(screen.getByText(/1 possible duplicate/)).toBeTruthy();
    expect(screen.getByTestId("review-card-r1")).toBeTruthy();
  });

  it("pluralises the count", async () => {
    mockHooks.useReviews.mockReturnValue(query({ data: [review, { ...review, id: "r2" }] }));
    await renderScreen(<ReviewQueueScreen />);
    expect(screen.getByText(/2 possible duplicates/)).toBeTruthy();
  });
});
