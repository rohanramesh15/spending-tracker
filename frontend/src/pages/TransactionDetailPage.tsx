import { useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Camera } from "lucide-react";
import { useTransaction } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { DetailSkeleton } from "@/components/Skeletons";
import { cn, formatCents } from "@/lib/utils";
import { parseISODate } from "@/lib/dates";
import { setPendingReceipt } from "@/lib/scanFile";

/**
 * Transaction detail (user-flow §7): read-only header + line-item list.
 * Mutating actions (edit / hide / delete) live on the Transactions list via the ⋯
 * bottom action sheet — this page is for inspecting the purchase.
 */
export default function TransactionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: txn, isLoading } = useTransaction(id);
  const scanInput = useRef<HTMLInputElement>(null);

  // Scan a receipt for an unitemized (bank/imported) transaction. On save, attended
  // reconciliation finds this same purchase and offers Merge — attaching the itemization.
  function onScanPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) {
      setPendingReceipt(file);
      navigate("/scan");
    }
  }

  if (isLoading) return <DetailSkeleton />;
  if (!txn) return <p className="text-sm text-muted-foreground">Not found.</p>;

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
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{txn.vendor}</h1>
          <p className="text-sm text-muted-foreground">
            {format(parseISODate(txn.purchased_on), "EEEE, MMM d, yyyy")} · {txn.source}
            {txn.hidden && " · hidden from spending"}
          </p>
        </div>
      </div>

      {txn.line_items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border">
          <ul className="divide-y">
            {txn.line_items.map((li) => (
              <li
                key={li.id}
                className={cn(
                  "flex items-center justify-between bg-background px-4 py-2.5",
                  li.hidden && "opacity-50",
                )}
              >
                <div>
                  <p className="text-sm font-medium">
                    {li.normalized_name ?? li.raw_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {li.category_name ?? "Uncategorized"}
                    {li.hidden && " · hidden from spending"}
                  </p>
                </div>
                <span className="text-sm">{formatCents(li.price_cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/30 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No itemized detail — charted under Uncategorized.
          </p>
          <input
            ref={scanInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={onScanPicked}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => scanInput.current?.click()}
          >
            <Camera className="mr-2 h-4 w-4" /> Scan a receipt to itemize
          </Button>
        </div>
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
