import type { ReactNode } from "react";
import { Paragraph } from "tamagui";

/**
 * The heading at the top of a screen.
 *
 * A component rather than an `<H2>` per screen so the size is decided once. Screens previously
 * mixed H2 (tabs) and H3 (pushed screens), which meant "make the headings smaller" was a change
 * in ten files and would have been applied to nine of them.
 *
 * Smaller and lighter than Tamagui's H2 by request: at the default size and weight the word
 * "Transactions" was the loudest thing on a screen whose subject is the numbers beneath it.
 */
export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <Paragraph fontSize={26} lineHeight={32} fontWeight="500" letterSpacing={-0.3}>
      {children}
    </Paragraph>
  );
}
