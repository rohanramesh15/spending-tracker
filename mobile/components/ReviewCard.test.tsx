import type { Review } from "@shared/api/types";
import { ReviewCard } from "@/components/ReviewCard";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

const review = {
  id: "rev-1",
  reason: "Vendor and total match within a cent, 1 day apart",
  incoming: {
    vendor: "Kroger",
    purchased_on: "2026-03-02",
    total_cents: 4212,
    source: "plaid",
    item_count: 0,
  },
  matched: {
    vendor: "Kroger",
    purchased_on: "2026-03-01",
    total_cents: 4212,
    source: "receipt",
    item_count: 7,
  },
} as Review;

describe("ReviewCard", () => {
  it("shows both transactions with their sources", async () => {
    await renderWithProviders(<ReviewCard review={review} busy={false} onResolve={jest.fn()} />);

    expect(screen.getByText(/Incoming · Bank/)).toBeTruthy();
    expect(screen.getByText(/Existing · Receipt/)).toBeTruthy();
  });

  it("shows the match reason so the decision is informed", async () => {
    // Without the reason the user is guessing at why these were paired at all.
    await renderWithProviders(<ReviewCard review={review} busy={false} onResolve={jest.fn()} />);
    expect(screen.getByText(review.reason)).toBeTruthy();
  });

  it("distinguishes an itemized match from an unitemized one", async () => {
    await renderWithProviders(<ReviewCard review={review} busy={false} onResolve={jest.fn()} />);
    expect(screen.getByText(/7 items/)).toBeTruthy();
    expect(screen.getByText(/no items/)).toBeTruthy();
  });

  it.each([["merge"], ["keep_both"], ["replace"], ["skip"]])(
    "offers %s and reports it with the review id",
    async (resolution) => {
      const onResolve = jest.fn();
      await renderWithProviders(<ReviewCard review={review} busy={false} onResolve={onResolve} />);

      await fireEvent.press(screen.getByTestId(`review-rev-1-${resolution}`));
      expect(onResolve).toHaveBeenCalledWith("rev-1", resolution);
    },
  );

  it("resolves nothing merely by rendering", async () => {
    // Unattended matches are parked here precisely because they must NOT be auto-merged
    // (CLAUDE.md #5); the card must never resolve without a deliberate tap.
    const onResolve = jest.fn();
    await renderWithProviders(<ReviewCard review={review} busy={false} onResolve={onResolve} />);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("disables every choice while a resolution is in flight", async () => {
    const onResolve = jest.fn();
    await renderWithProviders(<ReviewCard review={review} busy onResolve={onResolve} />);

    await fireEvent.press(screen.getByTestId("review-rev-1-merge"));
    expect(onResolve).not.toHaveBeenCalled();
  });
});
