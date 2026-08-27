import { createAnimations } from "@tamagui/animations-react-native";
import { defaultConfig } from "@tamagui/config/v4";
import { createTamagui } from "tamagui";

/**
 * Animation presets, declared explicitly rather than inherited from the preset spread.
 * Spreading defaultConfig loses the animation key types, so `animation="medium"` on a Sheet or
 * Dialog fails to typecheck even though it works at runtime. Naming them here makes the set
 * concrete and the prop type real.
 */
const animations = createAnimations({
  quick: { type: "spring", damping: 25, mass: 1.2, stiffness: 250 },
  medium: { type: "spring", damping: 20, mass: 1.2, stiffness: 180 },
  lazy: { type: "spring", damping: 22, stiffness: 90 },
});

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
  animations,
  /**
   * One custom token: the surface used by grouped blocks (transaction rows, settings rows).
   *
   * The v4 ramp jumps straight from `$color1` (100%) to `$color2` (95%), and against a white
   * page that 5% step reads heavier than intended. This adds the missing in-between step.
   * Defined per theme rather than as a raw hex because dark mode is live — the root provider
   * follows the system scheme — and a hard-coded light grey would be near-white on a dark page.
   */
  themes: (() => {
    const BLOCK = { light: "hsla(0, 0%, 96%, 1)", dark: "hsla(0, 0%, 11%, 1)" };
    // Pressed state: one step further from the page so the press still registers visually.
    const BLOCK_PRESS = { light: "hsla(0, 0%, 92%, 1)", dark: "hsla(0, 0%, 16%, 1)" };

    const light = { ...defaultConfig.themes.light, blockBackground: BLOCK.light };
    const dark = { ...defaultConfig.themes.dark, blockBackground: BLOCK.dark };

    return {
      ...defaultConfig.themes,
      light,
      dark,
      /**
       * Component themes. Tamagui resolves `<theme>_<Component>`, so this restyles EVERY
       * <Button> in the app without each screen opting in — which is the point: buttons and
       * grouped blocks are meant to be the same surface, and a per-screen override would drift
       * the moment someone adds a screen.
       */
      light_Button: {
        ...light,
        background: BLOCK.light,
        backgroundHover: BLOCK_PRESS.light,
        backgroundPress: BLOCK_PRESS.light,
        backgroundFocus: BLOCK_PRESS.light,
      },
      dark_Button: {
        ...dark,
        background: BLOCK.dark,
        backgroundHover: BLOCK_PRESS.dark,
        backgroundPress: BLOCK_PRESS.dark,
        backgroundFocus: BLOCK_PRESS.dark,
      },
    };
  })(),
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

// Both modules must be augmented. Component props (Sheet's `animation`, theme token names)
// are derived from @tamagui/core's TamaguiCustomConfig; augmenting only the `tamagui` re-export
// leaves those props untyped, which shows up as "Property 'animation' does not exist".
declare module "tamagui" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}

declare module "@tamagui/core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
