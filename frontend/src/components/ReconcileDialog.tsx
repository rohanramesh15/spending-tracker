import { Layers, Copy, Replace, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Resolution, ReconcileMatch } from "@/api/types";
import { formatCents } from "@/lib/utils";
import { parseISODate } from "@/lib/dates";

interface Props {
  /** The existing transaction we collided with. Dialog is open iff this is non-null. */
  match: ReconcileMatch | null;
  /** The transaction the user is currently trying to save (for the side-by-side). */
  incoming: { vendor: string; total_cents: number };
  busy?: boolean;
  onResolve: (resolution: Resolution) => void;
  onCancel: () => void;
}

const sourceLabel: Record<string, string> = {
  receipt: "scanned receipt",
  manual: "manual entry",
  plaid: "bank transaction",
};

/**
 * Attended reconciliation (plan §6.3, CLAUDE.md #5 — never auto-merge). Shown the moment
 * a save collides with an existing transaction, so the user decides on the spot:
 * merge (default) / keep both / replace / skip.
 */
export function ReconcileDialog({ match, incoming, busy, onResolve, onCancel }: Props) {
  const open = match !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Looks like a duplicate</DialogTitle>
          <DialogDescription>
            You already have a{" "}
            {match ? (sourceLabel[match.source] ?? "transaction") : "transaction"} that
            looks like this one. What should happen?
          </DialogDescription>
        </DialogHeader>

        {match && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Existing
              </p>
              <p className="mt-1 font-medium">{match.vendor}</p>
              <p className="text-muted-foreground">
                {parseISODate(match.purchased_on).toLocaleDateString()}
              </p>
              <p className="mt-1 font-semibold">{formatCents(match.total_cents)}</p>
              <p className="text-xs text-muted-foreground">
                {match.item_count} {match.item_count === 1 ? "item" : "items"}
              </p>
            </div>
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Adding now
              </p>
              <p className="mt-1 font-medium">{incoming.vendor}</p>
              <p className="mt-1 font-semibold">{formatCents(incoming.total_cents)}</p>
            </div>
          </div>
        )}

        <div className="mt-2 space-y-2">
          <Button
            className="w-full justify-start"
            disabled={busy}
            onClick={() => onResolve("merge")}
          >
            <Layers className="mr-2 h-4 w-4" />
            Merge — add these items to the existing entry
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={busy}
            onClick={() => onResolve("keep_both")}
          >
            <Copy className="mr-2 h-4 w-4" />
            Keep both — they're different purchases
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={busy}
            onClick={() => onResolve("replace")}
          >
            <Replace className="mr-2 h-4 w-4" />
            Replace — this one is correct, drop the old
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            disabled={busy}
            onClick={() => onResolve("skip")}
          >
            <X className="mr-2 h-4 w-4" />
            Skip — it's already recorded
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
