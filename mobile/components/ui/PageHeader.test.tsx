import { Paragraph } from "tamagui";

import { PageHeader } from "@/components/ui/PageHeader";
import { renderWithProviders, screen } from "@/test-utils";

/**
 * The point of this component is that the title centres on the SCREEN, not in whatever space the
 * accessories leave over — so the assertions are about the accessories being out of the layout
 * flow, which is the part that silently regresses if someone "simplifies" it back to a flex row.
 */
describe("PageHeader", () => {
  it("renders the title", async () => {
    await renderWithProviders(<PageHeader title="Transactions" />);
    expect(screen.getByText("Transactions")).toBeTruthy();
  });

  it("renders accessories on both sides", async () => {
    await renderWithProviders(
      <PageHeader
        title="Subscriptions"
        left={<Paragraph>BACK</Paragraph>}
        right={<Paragraph>RESCAN</Paragraph>}
      />,
    );

    expect(screen.getByText("BACK")).toBeTruthy();
    expect(screen.getByText("RESCAN")).toBeTruthy();
  });

  it("takes accessories out of the layout flow so the title stays centred", async () => {
    // As flex siblings, a left button with no right counterpart pushes the title off-centre by
    // half the button's width — differently on every screen, depending what sits beside it.
    await renderWithProviders(<PageHeader title="Review" left={<Paragraph>BACK</Paragraph>} />);

    const style = screen.getByText("BACK").parent?.props.style;
    expect(JSON.stringify(style)).toContain("absolute");
  });

  it("works with no accessories at all", async () => {
    await renderWithProviders(<PageHeader title="Settings" />);
    expect(screen.getByText("Settings")).toBeTruthy();
  });
});
