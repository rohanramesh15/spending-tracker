import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ConnectBankButton,
  AccountUpdateButton,
  PlaidLinkProvider,
} from "@/components/PlaidLink";
import { ListSkeleton } from "@/components/Skeletons";
import { useImportAppleCard, useLinkedAccounts, useSyncBank } from "@/api/hooks";
import type { AccountStatus } from "@/api/types";
import { signOut, useAuth } from "@/lib/useAuth";

const statusLabel: Record<AccountStatus, string> = {
  active: "Syncing",
  needs_reauth: "Reconnect needed",
  disconnected: "Disconnected",
};

/**
 * Settings — connected accounts, Apple Card import, account email, sign out (user-flow §9).
 * "Connected accounts" is the user-facing label; we never say "Plaid".
 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const accounts = useLinkedAccounts();
  const sync = useSyncBank();
  const importCsv = useImportAppleCard();
  const csvInput = useRef<HTMLInputElement>(null);
  const { session } = useAuth();
  const email = session?.user?.email ?? null;
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  async function onCsvPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      const r = await importCsv.mutateAsync(file);
      const parts = [
        r.imported && `${r.imported} added`,
        r.needs_review && `${r.needs_review} to review`,
        r.duplicates && `${r.duplicates} already imported`,
      ].filter(Boolean);
      toast.success(
        parts.length ? `Imported — ${parts.join(", ")}` : "Nothing new to import",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't import that file");
    }
  }

  async function handleSync() {
    try {
      const s = await sync.mutateAsync();
      const attention = s.accounts.filter((a) => a.needs_attention);
      if (attention.length) {
        // Never a silent "synced" while an account is actually stuck — name it.
        toast.warning(
          `${attention.map((a) => a.institution).join(", ")} need${
            attention.length === 1 ? "s" : ""
          } reconnecting`,
          { description: s.added ? `${s.added} new added from your other accounts` : undefined },
        );
        return;
      }
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
    <PlaidLinkProvider>
      <section className="space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="space-y-1 text-sm">
        <h2 className="font-medium">Account</h2>
        <p className="text-muted-foreground">
          Signed in as{" "}
          <span className="font-medium text-foreground">{email ?? "—"}</span>
        </p>
      </div>

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
          <ListSkeleton rows={2} />
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
                  <AccountUpdateButton accountId={a.id} status={a.status} />
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

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Import</h2>
        <p className="text-sm text-muted-foreground">
          Upload an Apple Card statement CSV. Purchases are added; anything matching an
          existing entry goes to your review queue.
        </p>
        <input
          ref={csvInput}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={onCsvPicked}
        />
        <Button
          variant="outline"
          onClick={() => csvInput.current?.click()}
          disabled={importCsv.isPending}
        >
          <Upload className="mr-2 h-4 w-4" />
          {importCsv.isPending ? "Importing…" : "Import Apple Card CSV"}
        </Button>
      </div>

      <Button variant="outline" onClick={() => setConfirmSignOut(true)}>
        Sign out
      </Button>

      <Dialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>
              You'll need a new magic link sent to your email to sign back in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmSignOut(false)}>
              Cancel
            </Button>
            <Button onClick={handleSignOut}>Sign out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </section>
    </PlaidLinkProvider>
  );
}
