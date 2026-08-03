import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react-native";
import { TamaguiProvider } from "tamagui";

import config from "./tamagui.config";

/**
 * Render inside TamaguiProvider. Every app component assumes the theme context exists —
 * without it they throw, which makes for confusing test failures unrelated to the component.
 */
function Providers({ children }: { children: ReactNode }) {
  return (
    <TamaguiProvider config={config} defaultTheme="light">
      {children}
    </TamaguiProvider>
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
