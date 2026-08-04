import { StyleSheet } from "react-native";
import { Paragraph } from "tamagui";

import { Screen } from "@/components/ui/Screen";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

const HEADER_HEIGHT = 100;

/** The safe-area inset the provider reports in tests. */
function harness() {
  return (
    <Screen testID="s" collapsingHeader={<Paragraph>HEADER</Paragraph>} scrollViewTestID="scroller">
      <Paragraph>BODY</Paragraph>
    </Screen>
  );
}

/** Report a measured height for the pinned header, as layout would. */
async function measureHeader(height = HEADER_HEIGHT) {
  await fireEvent(screen.getByTestId("collapsing-header"), "layout", {
    nativeEvent: { layout: { height } },
  });
}

describe("Screen", () => {
  it("renders its children", async () => {
    await renderWithProviders(
      <Screen testID="s">
        <Paragraph>BODY</Paragraph>
      </Screen>,
    );
    expect(screen.getByText("BODY")).toBeTruthy();
  });

  it("renders no pinned header unless one is given", async () => {
    await renderWithProviders(
      <Screen testID="s">
        <Paragraph>BODY</Paragraph>
      </Screen>,
    );
    expect(screen.queryByTestId("collapsing-header")).toBeNull();
  });
});

/**
 * The slide itself is driven by Animated.diffClamp on the native thread, so what is worth
 * asserting here is the wiring around it — the parts that, when wrong, leave the header floating
 * over the list or stuck under the status bar. The motion is verified on a device.
 */
describe("the collapsing header", () => {
  it("renders the header content", async () => {
    await renderWithProviders(harness());
    expect(screen.getByText("HEADER")).toBeTruthy();
  });

  it("lays the header out in flow, not as an overlay", async () => {
    // Absolute positioning is what produced the status-bar collision and the empty band: it
    // isn't laid out against SafeAreaView's padded box, so every fix was coordinate arithmetic.
    await renderWithProviders(harness());

    const style = StyleSheet.flatten(screen.getByTestId("collapsing-header").props.style);
    expect(style.position).toBeUndefined();
  });

  it("clips at the screen edge so the header slides away instead of over the status bar", async () => {
    await renderWithProviders(harness());

    const style = StyleSheet.flatten(screen.getByTestId("s").props.style);
    expect(style.overflow).toBe("hidden");
  });

  it("gives the list no top padding of its own — the header is a sibling, not an overlay", async () => {
    // A paddingTop kept in sync with the measured height by hand is exactly what left a gap
    // the size of the notch under the search bar.
    await renderWithProviders(harness());
    await measureHeader();

    const style = StyleSheet.flatten(
      screen.getByTestId("scroller").props.contentContainerStyle,
    );
    expect(style.paddingTop).toBe(0);
  });

  it("survives scrolling in both directions without the header unmounting", async () => {
    // The previous implementation latched on a wrong guess and left the header stuck part-way.
    await renderWithProviders(harness());
    await measureHeader();

    for (const y of [0, 40, 200, 180, 0]) {
      await fireEvent.scroll(screen.getByTestId("scroller"), {
        nativeEvent: { contentOffset: { y } },
      });
    }

    expect(screen.getByText("HEADER")).toBeTruthy();
  });
});

describe("the scroll view the header listens to", () => {
  it("is an Animated scroll view", async () => {
    // A native-driven Animated.event only attaches to an Animated component. On a plain
    // ScrollView the handler is accepted and silently ignored, so the header never moves —
    // it looked wired up and did nothing.
    await renderWithProviders(harness());

    const scroller = screen.getByTestId("scroller");
    expect(typeof scroller.props.onScroll).toBe("function");
    expect(scroller.props.scrollEventThrottle).toBe(16);
  });
});

describe("what gets animated", () => {
  it("animates a transform, not a layout property", async () => {
    // The native animated module rejects layout props outright: "Style property 'marginTop' is
    // not supported by native animated module" — a red box at runtime, invisible to tsc.
    await renderWithProviders(harness());

    const style = StyleSheet.flatten(
      screen.getByTestId("collapsing-header").parent?.props.style,
    );
    expect(style.transform).toBeTruthy();
    expect(style.marginTop).toBeUndefined();
  });

  it("moves the list with the header so no blank band is left behind", async () => {
    await renderWithProviders(harness());
    await measureHeader();

    const style = StyleSheet.flatten(screen.getByTestId("scroller").props.style);
    expect(style.transform).toBeTruthy();
    // ...and grows by the same amount, so translating up doesn't expose a gap at the bottom.
    expect(style.marginBottom).toBe(-HEADER_HEIGHT);
  });
});
