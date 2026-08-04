import { useCallback, useState } from "react";
import { createPlaidLinkSession } from "react-native-plaid-link-sdk";

import {
  useAccountReconnected,
  useCreateLinkToken,
  useCreateUpdateLinkToken,
  useExchangePublicToken,
} from "@shared/api/hooks";
import type { AccountStatus, SyncSummary } from "@shared/api/types";

/**
 * Native owner for both Plaid Link flows. Link tokens still come exclusively from the
 * authenticated backend; the device only presents Link and returns its short-lived public token.
 *
 * This uses Plaid Link v13's session API, which requires a development build. Do not import this
 * component from an Expo Go-only surface.
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
      try {
        const session = await createPlaidLinkSession({
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
