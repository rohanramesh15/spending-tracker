import { AppSheet, SheetRow } from "@/components/ui";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

describe("AppSheet", () => {
  // NOTE: Tamagui's Sheet keeps its children mounted while closed (it animates them in and
  // out), so "is it in the tree?" says nothing about visibility. Tests here cover the rows
  // themselves; whether the sheet is presented is Tamagui's concern, not ours.

  it("renders its rows when open", async () => {
    await renderWithProviders(
      <AppSheet open onOpenChange={jest.fn()}>
        <SheetRow label="Edit" onPress={jest.fn()} testID="row-edit" />
      </AppSheet>,
    );
    expect(screen.getByTestId("row-edit")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
  });
});

describe("SheetRow", () => {
  it("reports a tap", async () => {
    const onPress = jest.fn();
    await renderWithProviders(<SheetRow label="Delete" onPress={onPress} testID="row" />);
    await fireEvent.press(screen.getByTestId("row"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire merely by rendering", async () => {
    const onPress = jest.fn();
    await renderWithProviders(<SheetRow label="Delete" onPress={onPress} testID="row" />);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("marks a destructive action visually distinct", async () => {
    const { rerender } = await renderWithProviders(
      <SheetRow label="Delete" onPress={jest.fn()} testID="row" />,
    );
    const normal = screen.getByText("Delete").props.style;

    await rerender(<SheetRow label="Delete" onPress={jest.fn()} destructive testID="row" />);
    expect(screen.getByText("Delete").props.style).not.toEqual(normal);
  });
});
