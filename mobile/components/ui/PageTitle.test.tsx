import { StyleSheet } from "react-native";

import { PageTitle } from "@/components/ui/PageTitle";
import { renderWithProviders, screen } from "@/test-utils";

/**
 * Every screen's heading renders through this, so its size and weight are decided in one place.
 * Before it existed, screens mixed H2 and H3 and "make the headings smaller" would have been a
 * ten-file change applied to nine of them.
 */
describe("PageTitle", () => {
  it("renders its text", async () => {
    await renderWithProviders(<PageTitle>Transactions</PageTitle>);
    expect(screen.getByText("Transactions")).toBeTruthy();
  });

  it("stays well under Tamagui's default H2, which was too loud for these screens", async () => {
    await renderWithProviders(<PageTitle>Transactions</PageTitle>);
    // RN hands back an array of style objects; flatten before reading a single property.
    const { fontSize } = StyleSheet.flatten(screen.getByText("Transactions").props.style);
    expect(fontSize).toBeLessThanOrEqual(22);
  });

  it("is not bold", async () => {
    // The heading orients; the numbers beneath it are the subject.
    await renderWithProviders(<PageTitle>Transactions</PageTitle>);
    const { fontWeight } = StyleSheet.flatten(screen.getByText("Transactions").props.style);
    expect(Number(fontWeight)).toBeLessThan(700);
  });
});
