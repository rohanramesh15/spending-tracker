import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccountStatus } from "@/api/types";
import {
  useAccountReconnected,
  useCreateLinkToken,
  useCreateUpdateLinkToken,
  useExchangePublicToken,
} from "@/api/hooks";

// The active flow is stashed here so it survives the full-page OAuth redirect out to the
// bank and back (Chase/BofA/Amex): the link token, which flow it is, and — for an update —
// which account, so the return knows whether to exchange (connect) or reconnect (update).
const STORE_KEY = "plaid_link_flow";
type Flow = { token: string; mode: "connect" | "update"; accountId?: string };

interface PlaidLinkContextValue {
  startConnect: () => Promise<void>;
  startUpdate: (accountId: string) => Promise<void>;
  busy: boolean;
  pendingAccountId: string | null;
}

const PlaidLinkContext = createContext<PlaidLinkContextValue | null>(null);

export function usePlaidLinkFlow(): PlaidLinkContextValue {
  const ctx = useContext(PlaidLinkContext);
  if (!ctx) throw new Error("usePlaidLinkFlow must be used within <PlaidLinkProvider>");
  return ctx;
}

function readStoredFlow(): Flow | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Flow) : null;
  } catch {
    return null;
  }
}

/**
 * Single owner of Plaid Link for the page: the initial "Connect a bank" flow AND per-account
 * update mode (reconnect / add accounts), plus the OAuth redirect resume — all in one place,
 * so there's exactly one Plaid Link instance and no duplicate resume on the OAuth return.
 */
export function PlaidLinkProvider({ children }: { children: ReactNode }) {
  const createLinkToken = useCreateLinkToken();
  const createUpdateToken = useCreateUpdateLinkToken();
  const exchange = useExchangePublicToken();
  const reconnected = useAccountReconnected();

  // Returning from a bank's OAuth page? Plaid appends ?oauth_state_id=… to the redirect.
  const isOAuthReturn =
    typeof window !== "undefined" && window.location.search.includes("oauth_state_id");
  const [flow, setFlow] = useState<Flow | null>(() =>
    isOAuthReturn ? readStoredFlow() : null,
  );

  const cleanup = useCallback(() => {
    setFlow(null);
    localStorage.removeItem(STORE_KEY);
    if (isOAuthReturn) window.history.replaceState({}, "", window.location.pathname);
  }, [isOAuthReturn]);

  const onSuccess = useCallback(
    (publicToken: string) => {
      const active = flow ?? readStoredFlow();
      cleanup();
      if (!active) return;
      if (active.mode === "connect") {
        exchange.mutate(publicToken, {
          onSuccess: (res) => {
            const { added, needs_review } = res.synced;
            const tail =
              added || needs_review
                ? ` — ${added} added${needs_review ? `, ${needs_review} to review` : ""}`
                : "";
            toast.success(`Connected ${res.account.institution}${tail}`);
          },
          onError: (e) =>
            toast.error(e instanceof Error ? e.message : "Couldn't finish connecting"),
        });
      } else if (active.accountId) {
        // Update mode: the existing access token stays valid (no exchange) — just have the
        // server reactivate the account and pull anything new (incl. added accounts).
        reconnected.mutate(active.accountId, {
          onSuccess: (s) => {
            const tail =
              s.added || s.needs_review
                ? ` — ${s.added} added${s.needs_review ? `, ${s.needs_review} to review` : ""}`
                : "";
            toast.success(`Account updated${tail}`);
          },
          onError: (e) =>
            toast.error(e instanceof Error ? e.message : "Couldn't finish updating"),
        });
      }
    },
    [flow, cleanup, exchange, reconnected],
  );

  const { open, ready } = usePlaidLink({
    token: flow?.token ?? null,
    onSuccess,
    onExit: cleanup,
    ...(isOAuthReturn ? { receivedRedirectUri: window.location.href } : {}),
  });

  // Open Link once we have a token and the SDK is ready — covers the normal click flow and
  // the OAuth resume (flow restored from storage above).
  useEffect(() => {
    if (flow?.token && ready) open();
  }, [flow, ready, open]);

  const startConnect = useCallback(async () => {
    try {
      const { link_token } = await createLinkToken.mutateAsync();
      const next: Flow = { token: link_token, mode: "connect" };
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      setFlow(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bank connect isn't available");
    }
  }, [createLinkToken]);

  const startUpdate = useCallback(
    async (accountId: string) => {
      try {
        const { link_token } = await createUpdateToken.mutateAsync(accountId);
        const next: Flow = { token: link_token, mode: "update", accountId };
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
        setFlow(next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't start the update");
      }
    },
    [createUpdateToken],
  );

  const busy =
    createLinkToken.isPending ||
    createUpdateToken.isPending ||
    exchange.isPending ||
    reconnected.isPending ||
    (flow?.token != null && !ready);
  const pendingAccountId = flow?.mode === "update" ? (flow.accountId ?? null) : null;

  return (
    <PlaidLinkContext.Provider value={{ startConnect, startUpdate, busy, pendingAccountId }}>
      {children}
    </PlaidLinkContext.Provider>
  );
}

/** "Connect a bank" — triggers the shared connect flow. Sandbox test login: user_good / pass_good. */
export function ConnectBankButton({
  label = "Connect a bank",
  variant = "default",
}: {
  label?: string;
  variant?: "default" | "outline";
}) {
  const { startConnect, busy } = usePlaidLinkFlow();
  return (
    <Button variant={variant} onClick={startConnect} disabled={busy}>
      <Building2 className="mr-2 h-4 w-4" />
      {busy ? "Opening…" : label}
    </Button>
  );
}

/**
 * Per-account action: "Reconnect" when a connection needs attention (reauth), or "Manage"
 * to add/adjust accounts on a healthy connection. Both open Plaid in update mode — no new
 * Plaid Item is consumed either way.
 */
export function AccountUpdateButton({
  accountId,
  status,
}: {
  accountId: string;
  status: AccountStatus;
}) {
  const { startUpdate, busy, pendingAccountId } = usePlaidLinkFlow();
  const needsAttention = status !== "active";
  const isPending = pendingAccountId === accountId;
  return (
    <Button
      variant={needsAttention ? "default" : "ghost"}
      size="sm"
      onClick={() => startUpdate(accountId)}
      disabled={busy}
    >
      {isPending ? "Opening…" : needsAttention ? "Reconnect" : "Manage"}
    </Button>
  );
}
