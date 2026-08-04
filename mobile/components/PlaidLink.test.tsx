import { createPlaidLinkSession } from "react-native-plaid-link-sdk";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { accountActionLabel, usePlaidLinkFlow } from "@/components/PlaidLink";

/**
 * The Plaid SDK is native, so the Link sheet itself can only be exercised on a dev build
 * (plan §6/§11). What *can* be pinned in Jest is the orchestration around it, which is where
 * the security-relevant invariants live:
 *
 *  - link tokens always come from the authenticated backend, never the device,
 *  - a connect flow exchanges the public token; an update flow must NOT (it re-syncs instead),
 *  - the busy flag always clears, including on failure, or the UI deadlocks.
 */
jest.mock("react-native-plaid-link-sdk", () => ({ createPlaidLinkSession: jest.fn() }));

const mockHooks = {
  useCreateLinkToken: jest.fn(),
  useCreateUpdateLinkToken: jest.fn(),
  useExchangePublicToken: jest.fn(),
  useAccountReconnected: jest.fn(),
};
jest.mock("@shared/api/hooks", () => ({
  useCreateLinkToken: () => mockHooks.useCreateLinkToken(),
  useCreateUpdateLinkToken: () => mockHooks.useCreateUpdateLinkToken(),
  useExchangePublicToken: () => mockHooks.useExchangePublicToken(),
  useAccountReconnected: () => mockHooks.useAccountReconnected(),
}));

const createSession = createPlaidLinkSession as jest.Mock;

function mutation(mutateAsync: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
  return { mutateAsync, isPending: false };
}

/** Captures the config Plaid was opened with, so the test can drive onSuccess/onExit itself. */
function captureSession() {
  const open = jest.fn().mockResolvedValue(undefined);
  let config: { onSuccess: (r: { publicToken: string }) => void; onExit: () => void } | undefined;
  createSession.mockImplementation(async (cfg: typeof config) => {
    config = cfg;
    return { open };
  });
  return {
    open,
    get config() {
      if (!config) throw new Error("Plaid session was never created");
      return config;
    },
  };
}

const callbacks = { onSuccess: jest.fn(), onError: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useCreateLinkToken.mockReturnValue(mutation(jest.fn().mockResolvedValue({ link_token: "link-tok" })));
  mockHooks.useCreateUpdateLinkToken.mockReturnValue(mutation(jest.fn().mockResolvedValue({ link_token: "update-tok" })));
  mockHooks.useExchangePublicToken.mockReturnValue(mutation());
  mockHooks.useAccountReconnected.mockReturnValue(mutation());
});

async function renderFlow() {
  return renderHook(() => usePlaidLinkFlow(callbacks));
}

describe("connect flow", () => {
  it("opens Link with a backend-minted token and exchanges the public token", async () => {
    const session = captureSession();
    const exchange = jest.fn().mockResolvedValue({
      account: { institution: "Chase" },
      synced: { added: 3, needs_review: 1 },
    });
    mockHooks.useExchangePublicToken.mockReturnValue(mutation(exchange));

    const { result } = await renderFlow();
    await act(async () => result.current.startConnect());

    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ token: "link-tok" }));
    expect(session.open).toHaveBeenCalled();

    await act(async () => session.config.onSuccess({ publicToken: "public-tok" }));

    expect(exchange).toHaveBeenCalledWith("public-tok");
    await waitFor(() =>
      expect(callbacks.onSuccess).toHaveBeenCalledWith("Connected Chase — 3 added, 1 to review"),
    );
  });

  it("reports the connection without a change summary when nothing synced", async () => {
    const session = captureSession();
    mockHooks.useExchangePublicToken.mockReturnValue(
      mutation(
        jest.fn().mockResolvedValue({
          account: { institution: "Ally" },
          synced: { added: 0, needs_review: 0 },
        }),
      ),
    );

    const { result } = await renderFlow();
    await act(async () => result.current.startConnect());
    await act(async () => session.config.onSuccess({ publicToken: "p" }));

    await waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalledWith("Connected Ally"));
  });
});

describe("update flow", () => {
  it("re-syncs the existing account instead of exchanging a public token", async () => {
    const session = captureSession();
    const reconnected = jest.fn().mockResolvedValue({ added: 2, needs_review: 0 });
    const exchange = jest.fn();
    mockHooks.useAccountReconnected.mockReturnValue(mutation(reconnected));
    mockHooks.useExchangePublicToken.mockReturnValue(mutation(exchange));

    const { result } = await renderFlow();
    await act(async () => result.current.startUpdate("acct-1"));

    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ token: "update-tok" }));

    await act(async () => session.config.onSuccess({ publicToken: "ignored" }));

    expect(reconnected).toHaveBeenCalledWith("acct-1");
    // Exchanging here would mint a second Item and burn one of the 10 lifetime slots.
    expect(exchange).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(callbacks.onSuccess).toHaveBeenCalledWith("Account updated — 2 added"),
    );
  });

  it("marks only the account being updated as busy", async () => {
    captureSession();

    const { result } = await renderFlow();
    await act(async () => result.current.startUpdate("acct-1"));

    expect(result.current.openingAccountId).toBe("acct-1");
  });
});

describe("failure handling", () => {
  it("reports a failed token mint and clears busy", async () => {
    mockHooks.useCreateLinkToken.mockReturnValue(
      mutation(jest.fn().mockRejectedValue(new Error("backend down"))),
    );

    const { result } = await renderFlow();
    await act(async () => result.current.startConnect());

    expect(callbacks.onError).toHaveBeenCalledWith("backend down");
    expect(createSession).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.openingAccountId).toBeNull());
  });

  it("reports a Link session that fails to open", async () => {
    createSession.mockRejectedValue(new Error("no native module"));

    const { result } = await renderFlow();
    await act(async () => result.current.startConnect());

    expect(callbacks.onError).toHaveBeenCalledWith("no native module");
    await waitFor(() => expect(result.current.openingAccountId).toBeNull());
  });

  it("reports a failed exchange rather than a silent no-op", async () => {
    const session = captureSession();
    mockHooks.useExchangePublicToken.mockReturnValue(
      mutation(jest.fn().mockRejectedValue(new Error("exchange rejected"))),
    );

    const { result } = await renderFlow();
    await act(async () => result.current.startConnect());
    await act(async () => session.config.onSuccess({ publicToken: "p" }));

    await waitFor(() => expect(callbacks.onError).toHaveBeenCalledWith("exchange rejected"));
    await waitFor(() => expect(result.current.openingAccountId).toBeNull());
  });

  it("clears busy when the user exits Link without connecting", async () => {
    const session = captureSession();

    const { result } = await renderFlow();
    await act(async () => result.current.startConnect());
    await act(async () => session.config.onExit());

    expect(result.current.openingAccountId).toBeNull();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});

describe("accountActionLabel", () => {
  it("offers management for a healthy account and reconnection otherwise", () => {
    expect(accountActionLabel("active")).toBe("Manage");
    expect(accountActionLabel("needs_reauth")).toBe("Reconnect");
  });
});
