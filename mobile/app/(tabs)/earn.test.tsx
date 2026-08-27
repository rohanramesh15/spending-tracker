import EarnScreen from "@/app/(tabs)/earn";
import { fireEvent, renderScreen, screen } from "@/test-screen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => jest.clearAllMocks());

describe("EarnScreen", () => {
  it("lists every agent, shipped or not", async () => {
    await renderScreen(<EarnScreen />);
    expect(screen.getByText("Subscriptions")).toBeTruthy();
    expect(screen.getByText("Card Rewards Optimizer")).toBeTruthy();
    expect(screen.getByText("Fee & Interest Auditor")).toBeTruthy();
    expect(screen.getByText("Spending Assistant")).toBeTruthy();
  });

  it("marks unshipped agents as Soon rather than hiding them", async () => {
    // The roadmap is deliberately visible; a hidden feature reads as a missing one.
    await renderScreen(<EarnScreen />);
    expect(screen.getAllByText("SOON")).toHaveLength(2);
  });

  it("navigates to a shipped agent", async () => {
    await renderScreen(<EarnScreen />);
    await fireEvent.press(screen.getByTestId("feature-Subscriptions"));
    expect(mockPush).toHaveBeenCalledWith("/subscriptions");
  });

  it("does not navigate from an unshipped agent", async () => {
    await renderScreen(<EarnScreen />);
    await fireEvent.press(screen.getByTestId("feature-Spending Assistant"));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
