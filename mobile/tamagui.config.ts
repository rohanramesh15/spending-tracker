import { defaultConfig } from "@tamagui/config/v4";
import { createTamagui } from "tamagui";

/**
 * Tamagui base configuration.
 *
 * Step 2 of the Expo conversion deliberately keeps this thin: the v4 default preset gives
 * tokens, themes, shorthands and animations, which is enough to build and run the shell.
 * The app's real design-system layer (primitives, category theming) is step 4 — see
 * docs/expo-conversion-plan.md §5.
 *
 * NOTE: category colors are NOT redefined here. They live in shared/lib/categories.ts, where
 * they were validated for contrast and color-vision deficiency, and are referenced directly.
 * Re-picking them for native would silently break that validation.
 */
export const config = createTamagui({
  ...defaultConfig,
  settings: {
    ...defaultConfig.settings,
    // The v4 preset defaults this to true, which rejects `alignItems`/`padding`/`borderRadius`
    // and accepts only `ai`/`p`/`br`. Full property names are far more legible for a codebase
    // being ported screen by screen, and they read the same as the web source we're porting
    // from. The shorthands still work; this only stops them being mandatory.
    onlyAllowShorthands: false,
    // Permit raw style values (e.g. a "#eda100" from categoryColor()) alongside tokens.
    // The category palette is intentionally arbitrary hex — validated for contrast and CVD in
    // shared/lib/categories.ts — and it's applied to every chip and pie slice. Under the
    // stricter token-only setting each of those needs a cast, which is noise that hides real
    // type errors. Revisit in step 4 if the design system ends up tokenising the palette.
    allowedStyleValues: false,
  },
});

export type AppConfig = typeof config;

declare module "tamagui" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
