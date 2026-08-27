import { Paragraph } from "tamagui";

import { Button, type ButtonVariant } from "@/components/ui/Button";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

const VARIANTS: ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "destructive",
  "success",
  "link",
];

describe("Button — surface", () => {
  // Every colour here is a theme token. A token that doesn't exist resolves to nothing rather
  // than erroring, so a typo ships a button with no background — invisible on a white page and
  // invisible in a diff. This already happened once with $blockBackground.
  it.each(VARIANTS.filter((v) => v !== "ghost" && v !== "link"))(
    "gives %s a real background colour",
    async (variant) => {
      await renderWithProviders(
        <Button variant={variant} testID="b">
          Label
        </Button>,
      );

      const bg = screen.getByTestId("b").props.style.backgroundColor;
      expect(bg).toBeTruthy();
      expect(bg).not.toBe("transparent");
    },
  );

  it.each(VARIANTS)("gives %s a real label colour", async (variant) => {
    await renderWithProviders(
      <Button variant={variant} testID="b">
        Label
      </Button>,
    );

    const color = screen.getByText("Label").props.style.color;
    expect(color).toBeTruthy();
    expect(color).not.toBe("transparent");
  });

  it("leaves ghost transparent so it reads as low emphasis", async () => {
    await renderWithProviders(
      <Button variant="ghost" testID="b">
        Skip
      </Button>,
    );
    expect(screen.getByTestId("b").props.style.backgroundColor).toBe("transparent");
  });
});

describe("Button — sizes", () => {
  it.each([
    ["sm", 32],
    ["md", 44],
    ["lg", 52],
  ] as const)("%s is %ipx tall", async (size, height) => {
    await renderWithProviders(
      <Button size={size} testID="b">
        Label
      </Button>,
    );
    expect(screen.getByTestId("b")).toHaveStyle({ height });
  });

  it("defaults to the thumb-friendly medium", async () => {
    await renderWithProviders(<Button testID="b">Label</Button>);
    expect(screen.getByTestId("b")).toHaveStyle({ height: 44 });
  });

  it("keeps an icon-only button square so the tap target stays full height", async () => {
    await renderWithProviders(
      <Button icon={<Paragraph>i</Paragraph>} accessibilityLabel="More" testID="b" />,
    );
    expect(screen.getByTestId("b")).toHaveStyle({ width: 44, height: 44 });
  });
});

describe("Button — states", () => {
  it("does not fire when disabled", async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <Button disabled onPress={onPress} testID="b">
        Save
      </Button>,
    );

    await fireEvent.press(screen.getByTestId("b"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not fire while loading", async () => {
    // A second tap would run the same mutation twice; for ingest that means two transactions.
    const onPress = jest.fn();
    await renderWithProviders(
      <Button loading onPress={onPress} testID="b">
        Save
      </Button>,
    );

    await fireEvent.press(screen.getByTestId("b"));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("keeps the label while loading, so the button does not change width", async () => {
    // Swapping the label for a bare spinner moves the control out from under a thumb that is
    // already on its way down.
    await renderWithProviders(
      <Button loading testID="b">
        Save
      </Button>,
    );

    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("replaces the leading icon with the spinner rather than showing both", async () => {
    await renderWithProviders(
      <Button loading icon={<Paragraph>ICON</Paragraph>} testID="b">
        Save
      </Button>,
    );

    expect(screen.queryByText("ICON")).toBeNull();
  });

  it("reports disabled and busy to assistive tech", async () => {
    await renderWithProviders(
      <Button loading testID="b">
        Save
      </Button>,
    );

    expect(screen.getByTestId("b")).toBeDisabled();
  });

  it("fires normally when enabled", async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <Button onPress={onPress} testID="b">
        Save
      </Button>,
    );

    await fireEvent.press(screen.getByTestId("b"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("Button — accessibility", () => {
  it("names an icon-only button for screen readers", async () => {
    await renderWithProviders(
      <Button icon={<Paragraph>i</Paragraph>} accessibilityLabel="More actions" testID="b" />,
    );
    expect(screen.getByLabelText("More actions")).toBeTruthy();
  });
});
