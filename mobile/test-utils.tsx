import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TamaguiProvider } from "tamagui";

import config from "./tamagui.config";

/**
 * Screens read safe-area insets (Screen pins its collapsing header below the notch), and
 * useSafeAreaInsets throws without a provider. initialMetrics gives deterministic insets
 * instead of waiting for a native measurement that never arrives in Jest.
 */
const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};


/**
 * Render inside TamaguiProvider. Every app component assumes the theme context exists —
 * without it they throw, which makes for confusing test failures unrelated to the component.
 */
function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <TamaguiProvider config={config} defaultTheme="light">
        {children}
      </TamaguiProvider>
    </SafeAreaProvider>
  );
}

/**
 * NOTE: this is async, and callers must await it.
 *
 * @testing-library/react-native v14 made `render`, `rerender`, `unmount` and every `fireEvent`
 * helper async — they await React's act() internally. Calling them without awaiting appears to
 * work but leaves `screen` unpopulated, and every query then fails with the misleading
 * "`render` function has not been called". If you see that error, you forgot an await.
 */
export async function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: Providers, ...options });
}

export * from "@testing-library/react-native";
