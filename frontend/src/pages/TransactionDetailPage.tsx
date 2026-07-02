import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useTransaction, useDeleteTransaction } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";

/**
 * Transaction detail (user-flow §7): header + line-item table. No photo is ever
 * shown (deleted on confirm by design). Inline editing/overrides come in Phase 2.
 */
export default function TransactionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: txn, isLoading } = useTransaction(id);
  const del = useDeleteTransaction();

  async function remove() {
    if (!id) return;
    await del.mutateAsync(id);
    toast.success("Transaction deleted");
    navigate("/transactions");
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!txn) return <p className="text-sm text-muted-foreground">Not found.</p>;

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{txn.vendor}</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(txn.purchased_on), "EEEE, MMM d, yyyy")} · {txn.source}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={remove} aria-label="Delete" disabled={del.isPending}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {txn.line_items.length > 0 ? (
        <div className="rounded-xl border">
          <ul className="divide-y">
            {txn.line_items.map((li) => (
              <li key={li.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium">{li.normalized_name ?? li.raw_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {li.category_name ?? "Uncategorized"}
                  </p>
                </div>
                <span className="text-sm">{formatCents(li.price_cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No itemized detail — charted under Uncategorized.
        </p>
      )}

      <dl className="space-y-1 rounded-xl bg-muted/40 px-4 py-3 text-sm">
        {txn.subtotal_cents != null && (
          <Row label="Subtotal" value={formatCents(txn.subtotal_cents)} />
        )}
        {txn.tax_cents > 0 && <Row label="Tax" value={formatCents(txn.tax_cents)} />}
        {txn.tip_cents > 0 && <Row label="Tip" value={formatCents(txn.tip_cents)} />}
        <Row label="Total" value={formatCents(txn.total_cents, txn.currency)} bold />
      </dl>
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={"flex justify-between " + (bold ? "font-semibold" : "")}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
