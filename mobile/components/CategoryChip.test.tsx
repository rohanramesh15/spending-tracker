import { CategoryChip } from "@/components/CategoryChip";
import { categoryColor, categoryInk, categoryTint } from "@shared/lib/categories";
import { renderWithProviders, screen } from "@/test-utils";

/**
 * These pin the chip to the SHARED palette rather than to hard-coded hex values. The point is
 * that the native chip and the web chip cannot drift: if someone re-picks a color for native,
 * these still pass only if they changed it in shared/lib/categories.ts, where the contrast and
 * color-vision validation lives.
 */
describe("CategoryChip", () => {
  it("renders the category name", async () => {
    await renderWithProviders(<CategoryChip name="Food and Drinks" />);
    expect(screen.getByText("Food & Drinks")).toBeTruthy();
  });

  it("uses the shared display label rather than the raw stored key", async () => {
    // "Uncategorized" is the storage key; the UI must show "Not itemized".
    await renderWithProviders(<CategoryChip name="Uncategorized" />);
    expect(screen.getByText("Not itemized")).toBeTruthy();
    expect(screen.queryByText("Uncategorized")).toBeNull();
  });

  it("washes the background with the shared tint and inks the label with the darker step", async () => {
    await renderWithProviders(<CategoryChip name="Health" />);

    expect(screen.getByTestId("category-chip-Health")).toHaveStyle({
      backgroundColor: categoryTint("Health"),
    });
    // The tint must be a wash, not the solid fill — that swap is the whole point of the change.
    expect(categoryTint("Health")).not.toBe(categoryColor("Health"));

    // Chip text uses the darker ink step so the label clears WCAG text contrast (4.5:1),
    // which the fill alone is not required to meet.
    expect(screen.getByText("Health")).toHaveStyle({ color: categoryInk("Health") });
    expect(categoryInk("Health")).not.toBe(categoryColor("Health"));
  });

  it("falls back to the neutral rather than borrowing another category's hue", async () => {
    await renderWithProviders(<CategoryChip name="Not A Real Category" />);
    expect(screen.getByTestId("category-chip-Not A Real Category")).toHaveStyle({
      backgroundColor: categoryTint("Other"),
    });
  });
});
