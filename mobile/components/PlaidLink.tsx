import { useCallback, useState } from "react";

import {
  useAccountReconnected,
  useCreateLinkToken,
  useCreateUpdateLinkToken,
  useExchangePublicToken,
} from "@shared/api/hooks";
import type { AccountStatus, SyncSummary } from "@shared/api/types";

/**
 * The Plaid SDK is loaded lazily, and that is not an optimisation — it is load-bearing.
 *
 * Importing it at module scope throws "Cannot find native module 'ReactNativePlaidLinkSdk'"
 * anywhere the native module is absent, i.e. all of Expo Go. Because expo-router builds its
 * route table by eagerly evaluating every file under app/, and app/settings.tsx imports this
 * module, that throw happened during startup and took the ENTIRE APP down with an uncaught
 * error — the login screen never rendered, so nothing at all could be verified in Expo Go.
 *
 * Deferring the require confines the native dependency to the moment Link is actually opened.
 * Everything else in the app then runs in Expo Go as the plan intends (§6), and pressing
 * "Connect" without a dev build reports honestly that it needs one, rather than crashing or
 * silently doing nothing.
 */
type PlaidSdk = typeof import("react-native-plaid-link-sdk");

function loadPlaidSdk(): PlaidSdk | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-plaid-link-sdk") as PlaidSdk;
  } catch {
    return null;
  }
}

/** Shown when the native module is missing — the Expo Go case. */
const NEEDS_DEV_BUILD =
  "Bank connect needs a development build of the app; it can't run in Expo Go.";

/**
 * Native owner for both Plaid Link flows. Link tokens still come exclusively from the
 * authenticated backend; the device only presents Link and returns its short-lived public token.
 *
 * This uses Plaid Link v13's session API, which requires a development build.
 */
export function usePlaidLinkFlow({
  onSuccess,
  onError,
}: {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const createLinkToken = useCreateLinkToken();
  const createUpdateToken = useCreateUpdateLinkToken();
  const exchange = useExchangePublicToken();
  const reconnected = useAccountReconnected();
  const [openingAccountId, setOpeningAccountId] = useState<string | null>(null);

  const describeSync = useCallback((prefix: string, summary: SyncSummary) => {
    const changes = [
      summary.added ? `${summary.added} added` : null,
      summary.needs_review ? `${summary.needs_review} to review` : null,
    ].filter(Boolean);
    return changes.length ? `${prefix} — ${changes.join(", ")}` : prefix;
  }, []);

  const openLink = useCallback(
    async ({ token, accountId }: { token: string; accountId?: string }) => {
      // Two shapes of "not available": the require throws (Expo Go), or it resolves without the
      // native binding attached. Treat both the same rather than letting the second reach Plaid.
      const sdk = loadPlaidSdk();
      if (!sdk?.createPlaidLinkSession) {
        setOpeningAccountId(null);
        onError(NEEDS_DEV_BUILD);
        return;
      }

      try {
        const session = await sdk.createPlaidLinkSession({
          token,
          onSuccess: (success) => {
            void (async () => {
              try {
                if (accountId) {
                  const summary = await reconnected.mutateAsync(accountId);
                  onSuccess(describeSync("Account updated", summary));
                } else {
                  const result = await exchange.mutateAsync(success.publicToken);
                  onSuccess(describeSync(`Connected ${result.account.institution}`, result.synced));
                }
              } catch (error) {
                onError(error instanceof Error ? error.message : "Couldn't finish connecting");
              } finally {
                setOpeningAccountId(null);
              }
            })();
          },
          onExit: () => setOpeningAccountId(null),
          // Events are diagnostic-only; never send Link event metadata to the app backend.
          onEvent: () => undefined,
        });
        await session.open(true);
      } catch (error) {
        setOpeningAccountId(null);
        onError(error instanceof Error ? error.message : "Bank connect isn't available");
      }
    },
    [describeSync, exchange, onError, onSuccess, reconnected],
  );

  const startConnect = useCallback(async () => {
    setOpeningAccountId("connect");
    try {
      const { link_token } = await createLinkToken.mutateAsync();
      await openLink({ token: link_token });
    } catch (error) {
      setOpeningAccountId(null);
      onError(error instanceof Error ? error.message : "Bank connect isn't available");
    }
  }, [createLinkToken, onError, openLink]);

  const startUpdate = useCallback(
    async (accountId: string) => {
      setOpeningAccountId(accountId);
      try {
        const { link_token } = await createUpdateToken.mutateAsync(accountId);
        await openLink({ token: link_token, accountId });
      } catch (error) {
        setOpeningAccountId(null);
        onError(error instanceof Error ? error.message : "Couldn't open account management");
      }
    },
    [createUpdateToken, onError, openLink],
  );

  const busy =
    openingAccountId !== null ||
    createLinkToken.isPending ||
    createUpdateToken.isPending ||
    exchange.isPending ||
    reconnected.isPending;

  return { busy, openingAccountId, startConnect, startUpdate };
}

export function accountActionLabel(status: AccountStatus): string {
  return status === "active" ? "Manage" : "Reconnect";
}
