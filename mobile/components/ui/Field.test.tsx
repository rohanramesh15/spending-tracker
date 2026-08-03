import { Field, TextField } from "@/components/ui";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

describe("Field", () => {
  it("renders its label and children", async () => {
    await renderWithProviders(
      <Field label="Vendor">
        <TextField value="" onChangeText={jest.fn()} testID="vendor" />
      </Field>,
    );

    expect(screen.getByText("Vendor")).toBeTruthy();
    expect(screen.getByTestId("vendor")).toBeTruthy();
  });

  it("marks a required field", async () => {
    await renderWithProviders(<Field label="Total" required />);
    expect(screen.getByText("Total *")).toBeTruthy();
  });

  it("shows no error text when there is no error", async () => {
    await renderWithProviders(<Field label="Total" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces the error to assistive tech, not just visually", async () => {
    // On a phone the field is often scrolled out of view on submit, so the error has to be
    // reachable in the accessibility tree rather than relying on the user seeing red text.
    await renderWithProviders(<Field label="Total" error="Enter an amount" />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Enter an amount")).toBeTruthy();
  });
});

describe("TextField", () => {
  it("reports each edit to the caller", async () => {
    const onChangeText = jest.fn();
    await renderWithProviders(<TextField value="" onChangeText={onChangeText} testID="amount" />);

    await fireEvent.changeText(screen.getByTestId("amount"), "12.34");
    expect(onChangeText).toHaveBeenCalledWith("12.34");
  });

  it("styles an invalid input differently from a valid one", async () => {
    // RN has no accessibility "invalid" state, so this is visual only — the spoken cue comes
    // from Field's alert text. This asserts the two states are actually distinguishable
    // rather than the `invalid` prop being silently ignored.
    const { rerender } = await renderWithProviders(
      <TextField value="" onChangeText={jest.fn()} testID="amount" />,
    );
    const validBorder = screen.getByTestId("amount").props.style;

    await rerender(<TextField value="abc" onChangeText={jest.fn()} invalid testID="amount" />);
    const invalidBorder = screen.getByTestId("amount").props.style;

    expect(invalidBorder).not.toEqual(validBorder);
  });
});
