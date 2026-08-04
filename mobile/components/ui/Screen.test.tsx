import { StyleSheet } from "react-native";
import { Paragraph } from "tamagui";

import { Screen } from "@/components/ui/Screen";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

const HEADER_HEIGHT = 100;

/** The safe-area inset the provider reports in tests. */
const mockInsets = { top: 44, bottom: 34, left: 0, right: 0 };
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return { ...actual, useSafeAreaInsets: () => mockInsets };
});

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

  it("pins the header below the safe-area inset, not under the status bar", async () => {
    // An absolutely-positioned child is laid out against the parent's padding box, so it ignores
    // SafeAreaView's inset entirely. `top: 0` put the title and the + button behind the clock.
    await renderWithProviders(harness());

    const style = StyleSheet.flatten(screen.getByTestId("collapsing-header").props.style);
    expect(style.position).toBe("absolute");
    expect(style.top).toBe(mockInsets.top);
  });

  it("starts the list below the header once the header has been measured", async () => {
    await renderWithProviders(harness());
    await measureHeader();

    const style = StyleSheet.flatten(
      screen.getByTestId("scroller").props.contentContainerStyle,
    );
    expect(style.paddingTop).toBe(HEADER_HEIGHT);
  });

  it("re-measures when the header's height changes", async () => {
    // The search field and title settle after the first frame; translating by a stale height is
    // what left the header half-hidden with only the search bar showing.
    await renderWithProviders(harness());
    await measureHeader(60);
    await measureHeader(120);

    const style = StyleSheet.flatten(
      screen.getByTestId("scroller").props.contentContainerStyle,
    );
    expect(style.paddingTop).toBe(120);
  });

  it("ignores a zero-height measurement rather than collapsing the padding", async () => {
    await renderWithProviders(harness());
    await measureHeader(HEADER_HEIGHT);
    await measureHeader(0);

    const style = StyleSheet.flatten(
      screen.getByTestId("scroller").props.contentContainerStyle,
    );
    expect(style.paddingTop).toBe(HEADER_HEIGHT);
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
