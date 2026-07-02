import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectBankButton } from "@/components/ConnectBankButton";
import { useLinkedAccounts, useSyncBank } from "@/api/hooks";
import type { AccountStatus } from "@/api/types";
import { signOut } from "@/lib/useAuth";

const statusLabel: Record<AccountStatus, string> = {
  active: "Syncing",
  needs_reauth: "Reconnect needed",
  disconnected: "Disconnected",
};

/**
 * Settings — connected accounts, extraction provider, sign out (user-flow §9).
 * "Connected accounts" is the user-facing label; we never say "Plaid".
 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const accounts = useLinkedAccounts();
  const sync = useSyncBank();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  async function handleSync() {
    try {
      const s = await sync.mutateAsync();
      toast.success(
        s.added || s.needs_review
          ? `Synced — ${s.added} added${s.needs_review ? `, ${s.needs_review} to review` : ""}`
          : "You're up to date",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    }
  }

  const hasAccounts = (accounts.data?.length ?? 0) > 0;

  return (
    <section className="space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Connected accounts</h2>
          {hasAccounts && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSync}
              disabled={sync.isPending}
            >
              <RefreshCw
                className={"mr-1.5 h-4 w-4 " + (sync.isPending ? "animate-spin" : "")}
              />
              {sync.isPending ? "Syncing…" : "Sync now"}
            </Button>
          )}
        </div>

        {accounts.isLoading ? (
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
        ) : hasAccounts ? (
          <>
            <ul className="divide-y rounded-xl border">
              {accounts.data!.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium">{a.institution}</p>
                    <p className="text-xs text-muted-foreground">
                      {statusLabel[a.status]}
                      {a.last_synced_at
                        ? ` · synced ${formatDistanceToNow(new Date(a.last_synced_at), { addSuffix: true })}`
                        : " · not yet synced"}
                    </p>
                  </div>
                  {a.status !== "active" && (
                    <span className="text-xs font-medium text-warning-foreground">
                      Action needed
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <ConnectBankButton label="Connect another" variant="outline" />
          </>
        ) : (
          <div className="rounded-xl border bg-muted/30 p-6 text-center">
            <p className="mb-1 text-sm font-medium">No accounts connected</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Connect a bank to pull in transactions automatically. Receipts and manual
              entry work without it.
            </p>
            <ConnectBankButton />
          </div>
        )}
      </div>

      <div className="space-y-1 text-sm">
        <p className="font-medium">Extraction provider</p>
        <p className="text-muted-foreground">Gemini — free tier</p>
      </div>

      <Button variant="outline" onClick={handleSignOut}>
        Sign out
      </Button>
    </section>
  );
}
