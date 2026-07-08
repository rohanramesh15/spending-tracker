import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateLinkToken, useExchangePublicToken } from "@/api/hooks";

// The link token is stashed here so it survives the full-page redirect out to the bank's
// OAuth site and back (major US banks in production: Chase, BofA, Amex…).
const OAUTH_TOKEN_KEY = "plaid_link_token";

/**
 * "Connect a bank" via Plaid Link (labeled for the user as a bank, never "Plaid"). Flow:
 * fetch a link_token → open Link → on success hand the public_token to /exchange (stores
 * the Item + runs the initial sync).
 *
 * OAuth banks (production) bounce the whole page to the bank and back to our registered
 * redirect_uri (`/settings?oauth_state_id=…`). We detect that on mount and resume Link
 * with the stored token + `receivedRedirectUri`. Sandbox test login: user_good / pass_good.
 */
export function ConnectBankButton({
  label = "Connect a bank",
  variant = "default",
}: {
  label?: string;
  variant?: "default" | "outline";
}) {
  const createLinkToken = useCreateLinkToken();
  const exchange = useExchangePublicToken();

  // Returning from a bank's OAuth page? Plaid appends ?oauth_state_id=… to the redirect.
  const isOAuthRedirect =
    typeof window !== "undefined" && window.location.search.includes("oauth_state_id");

  const [token, setToken] = useState<string | null>(() =>
    isOAuthRedirect ? localStorage.getItem(OAUTH_TOKEN_KEY) : null,
  );

  const cleanup = useCallback(() => {
    setToken(null);
    localStorage.removeItem(OAUTH_TOKEN_KEY);
    if (isOAuthRedirect) {
      // Drop the oauth params so a refresh doesn't re-trigger the resume.
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [isOAuthRedirect]);

  const onSuccess = useCallback(
    (publicToken: string) => {
      cleanup();
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
    },
    [cleanup, exchange],
  );

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit: cleanup,
    ...(isOAuthRedirect ? { receivedRedirectUri: window.location.href } : {}),
  });

  // Open Link once we have a token and the SDK is ready — covers both the normal click
  // flow and the OAuth resume (token restored from storage above).
  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  async function connect() {
    try {
      const { link_token } = await createLinkToken.mutateAsync();
      localStorage.setItem(OAUTH_TOKEN_KEY, link_token); // survive an OAuth round-trip
      setToken(link_token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bank connect isn't available");
    }
  }

  const busy =
    createLinkToken.isPending || exchange.isPending || (token !== null && !ready);
  return (
    <Button variant={variant} onClick={connect} disabled={busy}>
      <Building2 className="mr-2 h-4 w-4" />
      {exchange.isPending ? "Finishing…" : busy ? "Opening…" : label}
    </Button>
  );
}
