import * as DocumentPicker from "expo-document-picker";

import SettingsScreen from "@/app/(tabs)/settings";
import { fireEvent, mutation, query, renderScreen, screen, waitFor } from "@/test-screen";

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/components/PlaidLink", () => ({
  usePlaidLinkFlow: () => ({
    busy: false,
    openingAccountId: null,
    startConnect: jest.fn(),
    startUpdate: jest.fn(),
  }),
  accountActionLabel: (s: string) => (s === "active" ? "Manage" : "Reconnect"),
}));
let mockSession: unknown = {
  user: {
    email: "someone@example.com",
    user_metadata: { full_name: "Ada Lovelace", avatar_url: "https://example.com/a.png" },
  },
};
jest.mock("@/lib/useAuth", () => ({
  useAuth: () => ({ session: mockSession, loading: false }),
  signOut: jest.fn().mockResolvedValue(undefined),
}));

const mockHooks = {
  useLinkedAccounts: jest.fn(),
  useSyncBank: jest.fn(),
  useImportAppleCard: jest.fn(),
};
jest.mock("@shared/api/hooks", () => ({
  useLinkedAccounts: (...a: unknown[]) => mockHooks.useLinkedAccounts(...a),
  useSyncBank: (...a: unknown[]) => mockHooks.useSyncBank(...a),
  useImportAppleCard: (...a: unknown[]) => mockHooks.useImportAppleCard(...a),
}));

const picker = DocumentPicker.getDocumentAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = {
    user: {
      email: "someone@example.com",
      user_metadata: { full_name: "Ada Lovelace", avatar_url: "https://example.com/a.png" },
    },
  };
  mockHooks.useLinkedAccounts.mockReturnValue(query({ data: [] }));
  mockHooks.useSyncBank.mockReturnValue(mutation());
  mockHooks.useImportAppleCard.mockReturnValue(mutation());
});

describe("Settings — Apple Card import", () => {
  it("sends the picked file to the shared ingest hook", async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ imported: 3, needs_review: 0, duplicates: 0 });
    mockHooks.useImportAppleCard.mockReturnValue(mutation({ mutateAsync }));
    picker.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/statement.csv", name: "statement.csv", mimeType: "text/csv" }],
    });

    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId("import-csv"));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        uri: "file:///tmp/statement.csv",
        name: "statement.csv",
        type: "text/csv",
      }),
    );
  });

  it("does nothing when the picker is cancelled", async () => {
    // Backing out of the file picker is a normal action, not an error to report.
    const mutateAsync = jest.fn();
    mockHooks.useImportAppleCard.mockReturnValue(mutation({ mutateAsync }));
    picker.mockResolvedValue({ canceled: true, assets: null });

    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId("import-csv"));

    await waitFor(() => expect(picker).toHaveBeenCalled());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("reports duplicates rather than implying everything was added", async () => {
    // The ingest door is idempotent (CLAUDE.md #4), so re-importing an overlapping statement
    // matches instead of double-counting. The user must be able to see that happened.
    const mutateAsync = jest.fn().mockResolvedValue({ imported: 1, needs_review: 2, duplicates: 9 });
    mockHooks.useImportAppleCard.mockReturnValue(mutation({ mutateAsync }));
    picker.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/s.csv", name: "s.csv", mimeType: "text/csv" }],
    });

    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId("import-csv"));

    await waitFor(() => expect(screen.getByTestId("toast")).toBeTruthy());
    expect(screen.getByText(/1 added/)).toBeTruthy();
    expect(screen.getByText(/2 to review/)).toBeTruthy();
    expect(screen.getByText(/9 already imported/)).toBeTruthy();
  });

  it("says so when a statement adds nothing new", async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ imported: 0, needs_review: 0, duplicates: 0 });
    mockHooks.useImportAppleCard.mockReturnValue(mutation({ mutateAsync }));
    picker.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/s.csv", name: "s.csv", mimeType: "text/csv" }],
    });

    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId("import-csv"));

    await waitFor(() => expect(screen.getByText("Nothing new to import")).toBeTruthy());
  });

  it("surfaces an import failure instead of a false success", async () => {
    const mutateAsync = jest.fn().mockRejectedValue(new Error("Unsupported format"));
    mockHooks.useImportAppleCard.mockReturnValue(mutation({ mutateAsync }));
    picker.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/s.csv", name: "s.csv", mimeType: "text/csv" }],
    });

    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId("import-csv"));

    await waitFor(() => expect(screen.getByText("Unsupported format")).toBeTruthy());
  });
});

describe("Settings — accounts", () => {
  it("shows the signed-in email", async () => {
    await renderScreen(<SettingsScreen />);
    expect(screen.getByText(/someone@example.com/)).toBeTruthy();
  });

  it("offers to connect a bank when none are linked", async () => {
    await renderScreen(<SettingsScreen />);
    expect(screen.getByText("No accounts connected")).toBeTruthy();
  });

  it("names a stuck account rather than reporting a silent success", async () => {
    // A sync that "succeeds" while an account needs reauth is the failure mode worth catching:
    // the user would believe they're up to date while transactions silently stop arriving.
    const mutateAsync = jest.fn().mockResolvedValue({
      added: 0,
      needs_review: 0,
      accounts: [{ institution: "Chase", needs_attention: true }],
    });
    mockHooks.useSyncBank.mockReturnValue(mutation({ mutateAsync }));
    mockHooks.useLinkedAccounts.mockReturnValue(
      query({ data: [{ id: "a1", institution: "Chase", status: "needs_reauth" }] }),
    );

    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByText("Sync now"));

    await waitFor(() => expect(screen.getByText(/Chase need/)).toBeTruthy());
  });

  it("surfaces an error when connected accounts can't be loaded", async () => {
    mockHooks.useLinkedAccounts.mockReturnValue(query({ isError: true }));
    await renderScreen(<SettingsScreen />);
    expect(screen.getByTestId("error-state")).toBeTruthy();
  });
});

describe("profile block", () => {
  // Settings doubles as the profile page, so the identity has to actually render — not just
  // sit in a caption that says "Signed in as".
  it("shows the signed-in name and email", async () => {
    await renderScreen(<SettingsScreen />);

    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("someone@example.com")).toBeTruthy();
  });

  it("falls back to the email's local part when Google sent no name", async () => {
    mockSession = { user: { email: "someone@example.com", user_metadata: {} } };

    await renderScreen(<SettingsScreen />);

    expect(screen.getByText("someone")).toBeTruthy();
  });

  it("renders an initial instead of an avatar when there is no picture", async () => {
    mockSession = { user: { email: "zoe@example.com", user_metadata: { name: "Zoe" } } };

    await renderScreen(<SettingsScreen />);

    expect(screen.getByText("Z")).toBeTruthy();
  });

  it("still renders the block when signed out rather than crashing", async () => {
    mockSession = null;

    await renderScreen(<SettingsScreen />);

    expect(screen.getByTestId("profile-block")).toBeTruthy();
  });
});
