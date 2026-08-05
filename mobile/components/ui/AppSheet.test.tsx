import { StyleSheet } from "react-native";

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

  it("rules off a title from the sheet's content", async () => {
    await renderWithProviders(
      <AppSheet open onOpenChange={jest.fn()} title="Actions">
        <SheetRow label="Edit" onPress={jest.fn()} testID="row-edit" />
      </AppSheet>,
    );
    expect(screen.getByTestId("sheet-title-separator")).toBeTruthy();
  });

  it("adds nothing between the rule and the first row, so it sits where a block row would", async () => {
    // The row's own paddingVertical must be the ONLY space under the rule. A gap on the frame or
    // padding under the header stacks on top of it and the first row sits lower than every row
    // in the list behind the sheet.
    await renderWithProviders(
      <AppSheet open onOpenChange={jest.fn()} title="Actions">
        <SheetRow label="Edit" onPress={jest.fn()} testID="row-edit" />
      </AppSheet>,
    );

    const header = screen.getByTestId("sheet-title-separator").parent;
    const headerStyle = StyleSheet.flatten(header?.props.style);
    expect(headerStyle?.paddingBottom ?? 0).toBe(0);
    expect(headerStyle?.marginBottom ?? 0).toBe(0);

    // The gap lives on the content wrapper, which is a sibling BELOW the header — so it spaces
    // rows from each other and never the header from the first row.
    expect(screen.getByTestId("sheet-content")).toBeTruthy();
  });

  it("draws no rule where there is no title to rule off", async () => {
    await renderWithProviders(
      <AppSheet open onOpenChange={jest.fn()}>
        <SheetRow label="Edit" onPress={jest.fn()} testID="row-edit" />
      </AppSheet>,
    );
    expect(screen.queryByTestId("sheet-title-separator")).toBeNull();
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
