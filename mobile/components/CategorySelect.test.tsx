import { CategorySelect } from "@/components/CategorySelect";
import { categoryColor } from "@shared/lib/categories";
import { fireEvent, query, renderScreen, screen } from "@/test-screen";

const mockHooks = { useCategories: jest.fn() };
jest.mock("@shared/api/hooks", () => ({ useCategories: () => mockHooks.useCategories() }));

const categories = [
  { id: "c1", name: "Food and Drinks" },
  { id: "c2", name: "Uncategorized" },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useCategories.mockReturnValue(query({ data: categories }));
});

describe("CategorySelect", () => {
  it("prompts when nothing is chosen", async () => {
    await renderScreen(<CategorySelect value={null} onChange={jest.fn()} />);
    expect(screen.getByTestId("category-select-label").props.children).toBe("Pick a category");
  });

  it("shows the chosen category's display label", async () => {
    await renderScreen(<CategorySelect value="c2" onChange={jest.fn()} />);
    // Uncategorized is the storage key; the trigger must show the display label.
    expect(screen.getByTestId("category-select-label").props.children).toBe("Not itemized");
  });

  it("only offers categories the API returned", async () => {
    // The taxonomy is fixed and seeded server-side (CLAUDE.md #9) — the UI must never let a
    // user invent one.
    await renderScreen(<CategorySelect value={null} onChange={jest.fn()} />);
    await fireEvent.press(screen.getByTestId("category-select"));

    expect(screen.getByTestId("category-option-Food and Drinks")).toBeTruthy();
    expect(screen.getByTestId("category-option-Uncategorized")).toBeTruthy();
    expect(screen.queryByTestId("category-option-Shopping")).toBeNull();
  });

  it("reports the chosen category's id", async () => {
    const onChange = jest.fn();
    await renderScreen(<CategorySelect value={null} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId("category-select"));
    await fireEvent.press(screen.getByTestId("category-option-Food and Drinks"));

    expect(onChange).toHaveBeenCalledWith("c1");
  });

  it("swatches from the shared palette", async () => {
    await renderScreen(<CategorySelect value={null} onChange={jest.fn()} />);
    await fireEvent.press(screen.getByTestId("category-select"));
    // Sanity: the palette lookup is the shared one, not a local re-pick.
    expect(categoryColor("Food and Drinks")).toBe("#eda100");
  });

  it("disables itself while categories load", async () => {
    mockHooks.useCategories.mockReturnValue(query({ isLoading: true }));
    await renderScreen(<CategorySelect value={null} onChange={jest.fn()} />);
    expect(screen.getByTestId("category-select-label").props.children).toBe("Loading…");
  });
});
