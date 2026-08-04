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
export function PageTitle({
  children,
  size = "page",
}: {
  children: ReactNode;
  /** "sheet" is a step down — a sheet's title sits in a smaller surface than a screen's. */
  size?: "page" | "sheet";
}) {
  const scale = size === "sheet" ? { fontSize: 17, lineHeight: 22 } : { fontSize: 21, lineHeight: 26 };
  return (
    <Paragraph {...scale} fontWeight="500" letterSpacing={-0.2} textAlign="center">
      {children}
    </Paragraph>
  );
}
