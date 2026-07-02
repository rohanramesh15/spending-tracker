import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateLinkToken, useExchangePublicToken } from "@/api/hooks";

/**
 * "Connect a bank" via Plaid Link (user-flow §1/§9; labeled for the user as a bank, never
 * "Plaid"). Flow: fetch a link_token → open Link → on success hand the public_token to the
 * backend's /exchange (which stores the Item and runs the initial sync). Sandbox test login:
 * user_good / pass_good.
 */
export function ConnectBankButton({
  label = "Connect a bank",
  variant = "default",
}: {
  label?: string;
  variant?: "default" | "outline";
}) {
  const [token, setToken] = useState<string | null>(null);
  const createLinkToken = useCreateLinkToken();
  const exchange = useExchangePublicToken();

  const onSuccess = useCallback(
    (publicToken: string) => {
      setToken(null);
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
    [exchange],
  );

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit: () => setToken(null),
  });

  // Open Link as soon as we have a token and the SDK is ready.
  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  async function connect() {
    try {
      const { link_token } = await createLinkToken.mutateAsync();
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
