import { SearchField } from "@/components/ui/SearchField";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

describe("SearchField", () => {
  it("reports what was typed", async () => {
    const onChangeText = jest.fn();
    await renderWithProviders(
      <SearchField value="" onChangeText={onChangeText} testID="search" />,
    );

    await fireEvent.changeText(screen.getByTestId("search"), "kroger");

    expect(onChangeText).toHaveBeenCalledWith("kroger");
  });

  it("offers no clear button while empty", async () => {
    // A permanently visible clear button is a control that does nothing.
    await renderWithProviders(<SearchField value="" onChangeText={jest.fn()} testID="search" />);
    expect(screen.queryByTestId("search-clear")).toBeNull();
  });

  it("offers a clear button once there is something to clear", async () => {
    await renderWithProviders(
      <SearchField value="kroger" onChangeText={jest.fn()} testID="search" />,
    );
    expect(screen.getByTestId("search-clear")).toBeTruthy();
  });

  it("clears to an empty string", async () => {
    const onChangeText = jest.fn();
    await renderWithProviders(
      <SearchField value="kroger" onChangeText={onChangeText} testID="search" />,
    );

    await fireEvent.press(screen.getByTestId("search-clear"));

    expect(onChangeText).toHaveBeenCalledWith("");
  });

  it("does not autocapitalise or autocorrect what it matches against", async () => {
    await renderWithProviders(<SearchField value="" onChangeText={jest.fn()} testID="search" />);
    const input = screen.getByTestId("search");
    expect(input.props.autoCapitalize).toBe("none");
    expect(input.props.autoCorrect).toBe(false);
  });
});
