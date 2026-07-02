import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Layers, Copy, Replace, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReviews, useResolveReview } from "@/api/hooks";
import type { Resolution, Review, ReviewTxn } from "@/api/types";
import { formatCents } from "@/lib/utils";
import { parseISODate } from "@/lib/dates";

const sourceLabel: Record<string, string> = {
  plaid: "Bank",
  receipt: "Receipt",
  manual: "Manual",
};

const doneMessage: Record<Resolution, string> = {
  merge: "Merged",
  keep_both: "Kept both",
  replace: "Replaced",
  skip: "Skipped",
};

/**
 * Review queue (user-flow §6) — drain unattended reconciliation matches. Each card shows
 * the incoming bank transaction vs. the matched existing entry with the match reason, and
 * resolves in one tap: Merge (primary) / Keep both / Replace / Skip. Resolved transactions
 * immediately (re)enter the charts (they were excluded while pending).
 */
export default function ReviewQueuePage() {
  const navigate = useNavigate();
  const reviews = useReviews();
  const resolve = useResolveReview();

  async function act(reviewId: string, resolution: Resolution) {
    try {
      await resolve.mutateAsync({ reviewId, resolution });
      toast.success(doneMessage[resolution]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resolve that");
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Review</h1>
      </div>

      {reviews.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : reviews.data && reviews.data.length > 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {reviews.data.length} possible duplicate{reviews.data.length === 1 ? "" : "s"}{" "}
            — pick what to keep.
          </p>
          {reviews.data.map((r) => (
            <ReviewCard key={r.id} review={r} busy={resolve.isPending} onResolve={act} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/30 p-10 text-center">
          <Check className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="font-medium">All caught up</p>
          <p className="text-sm text-muted-foreground">Nothing needs review right now.</p>
        </div>
      )}
    </section>
  );
}

function TxnMini({ label, txn }: { label: string; txn: ReviewTxn }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label} · {sourceLabel[txn.source] ?? txn.source}
      </p>
      <p className="mt-1 font-medium">{txn.vendor}</p>
      <p className="text-xs text-muted-foreground">
        {parseISODate(txn.purchased_on).toLocaleDateString()} ·{" "}
        {txn.item_count > 0
          ? `${txn.item_count} item${txn.item_count === 1 ? "" : "s"}`
          : "no items"}
      </p>
      <p className="mt-1 font-semibold">{formatCents(txn.total_cents)}</p>
    </div>
  );
}

function ReviewCard({
  review,
  busy,
  onResolve,
}: {
  review: Review;
  busy: boolean;
  onResolve: (id: string, r: Resolution) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <TxnMini label="Incoming" txn={review.incoming} />
        <TxnMini label="Existing" txn={review.matched} />
      </div>
      <p className="text-xs text-muted-foreground">{review.reason}</p>

      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={() => onResolve(review.id, "merge")}>
          <Layers className="mr-1.5 h-4 w-4" /> Merge
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onResolve(review.id, "keep_both")}
        >
          <Copy className="mr-1.5 h-4 w-4" /> Keep both
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onResolve(review.id, "replace")}
        >
          <Replace className="mr-1.5 h-4 w-4" /> Replace
        </Button>
        <Button
          variant="ghost"
          className="text-muted-foreground"
          disabled={busy}
          onClick={() => onResolve(review.id, "skip")}
        >
          <X className="mr-1.5 h-4 w-4" /> Skip
        </Button>
      </div>
    </div>
  );
}
