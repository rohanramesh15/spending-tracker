import LoginScreen from "@/app/login";
import { SignInCancelled } from "@/lib/useAuth";
import { fireEvent, renderScreen, screen, waitFor } from "@/test-screen";

/**
 * The OAuth round trip itself needs real credentials and a device (plan §7.1, step 3). What the
 * screen owes regardless is its four states: idle, in-flight, cancelled-is-not-an-error, and
 * failed-with-a-readable-message — plus the unconfigured-environment notice that keeps the app
 * usable without Supabase keys.
 */
const mockSignIn = jest.fn();
jest.mock("@/lib/useAuth", () => {
  class SignInCancelled extends Error {}
  return { SignInCancelled, signInWithGoogle: (...a: unknown[]) => mockSignIn(...a) };
});

let mockConfigured = true;
jest.mock("@/lib/env", () => ({
  get IS_SUPABASE_CONFIGURED() {
    return mockConfigured;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockConfigured = true;
  mockSignIn.mockResolvedValue(undefined);
});

it("starts Google sign-in when the button is pressed", async () => {
  await renderScreen(<LoginScreen />);

  await fireEvent.press(screen.getByLabelText("Continue with Google"));

  expect(mockSignIn).toHaveBeenCalled();
});

it("shows an in-flight label while signing in", async () => {
  let release: () => void = () => undefined;
  mockSignIn.mockReturnValue(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );

  await renderScreen(<LoginScreen />);
  // Deliberately not awaited: the press can't settle until `release()` resolves sign-in, and
  // awaiting it here would deadlock the test rather than let us observe the in-flight state.
  const press = fireEvent.press(screen.getByLabelText("Continue with Google"));

  await waitFor(() => expect(screen.getByText("Signing in…")).toBeTruthy());

  release();
  await press;

  await waitFor(() => expect(screen.getByText("Continue with Google")).toBeTruthy());
});

it("stays silent when the user backs out of the browser sheet", async () => {
  // Cancelling is a normal action; surfacing it as an error would read as a broken sign-in.
  mockSignIn.mockRejectedValue(new SignInCancelled());

  await renderScreen(<LoginScreen />);
  await fireEvent.press(screen.getByLabelText("Continue with Google"));

  await waitFor(() => expect(screen.getByText("Continue with Google")).toBeTruthy());
  expect(screen.queryByText(/failed/i)).toBeNull();
});

it("surfaces a real sign-in failure", async () => {
  mockSignIn.mockRejectedValue(new Error("Provider unavailable"));

  await renderScreen(<LoginScreen />);
  await fireEvent.press(screen.getByLabelText("Continue with Google"));

  await waitFor(() => expect(screen.getByText("Provider unavailable")).toBeTruthy());
});

it("explains what is missing and disables sign-in when Supabase is unconfigured", async () => {
  mockConfigured = false;

  await renderScreen(<LoginScreen />);

  expect(screen.getByText(/Supabase isn't configured/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Continue with Google"));
  expect(mockSignIn).not.toHaveBeenCalled();
});
