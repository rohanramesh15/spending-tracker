import { Button } from "tamagui";

import { ToastProvider, useToast } from "@/components/ui";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test-utils";

function Harness() {
  const toast = useToast();
  return (
    <>
      <Button testID="ok" onPress={() => toast.success("Saved")}>
        ok
      </Button>
      <Button testID="bad" onPress={() => toast.error("Nope")}>
        bad
      </Button>
    </>
  );
}

function renderHarness() {
  return renderWithProviders(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

/**
 * Real timers deliberately: @testing-library/react-native v14 awaits act() internally, and
 * jest's fake timers deadlock against that — the render never settles. The auto-dismiss test
 * pays ~3s for that, which is worth it to cover a toast that could otherwise cover the tab bar
 * forever.
 */
describe("Toast", () => {
  it("shows nothing until something is reported", async () => {
    await renderHarness();
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  it("shows a success message", async () => {
    await renderHarness();
    await fireEvent.press(screen.getByTestId("ok"));
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("replaces the previous message rather than stacking", async () => {
    await renderHarness();
    await fireEvent.press(screen.getByTestId("ok"));
    await fireEvent.press(screen.getByTestId("bad"));

    expect(screen.getByText("Nope")).toBeTruthy();
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("dismisses itself rather than covering the tab bar forever", async () => {
    await renderHarness();
    await fireEvent.press(screen.getByTestId("ok"));
    expect(screen.getByTestId("toast")).toBeTruthy();

    await waitFor(() => expect(screen.queryByTestId("toast")).toBeNull(), { timeout: 4000 });
  }, 10000);

  it("refuses to be used outside its provider", async () => {
    // Silently no-oping would let a failed save look like a successful one.
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(renderWithProviders(<Harness />)).rejects.toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
