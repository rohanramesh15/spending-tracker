import { ChartSkeleton, ListSkeleton, Skeleton } from "@/components/ui";
import { renderWithProviders, screen } from "@/test-utils";

describe("Skeletons", () => {
  it("exposes a loading role so the wait is announced, not silent", async () => {
    await renderWithProviders(<Skeleton />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("renders one placeholder pair per requested row", async () => {
    await renderWithProviders(<ListSkeleton rows={3} />);
    // Two bars per row (title + subtitle), mirroring a transaction row's shape.
    expect(screen.getAllByRole("progressbar")).toHaveLength(6);
  });

  it("defaults to four rows, matching the web list skeleton", async () => {
    await renderWithProviders(<ListSkeleton />);
    expect(screen.getAllByRole("progressbar")).toHaveLength(8);
  });

  it("renders a circular stand-in for the pie chart", async () => {
    await renderWithProviders(<ChartSkeleton />);
    expect(screen.getByTestId("chart-skeleton")).toBeTruthy();
    expect(screen.getByLabelText("Loading chart")).toBeTruthy();
  });
});
