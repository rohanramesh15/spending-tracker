import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Camera, Pencil } from "lucide-react";
import {
  useTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
  useUpdateLineItem,
  useDeleteLineItem,
} from "@/api/hooks";
import type { LineItem } from "@/api/types";
import { Button } from "@/components/ui/button";
import { DetailSkeleton } from "@/components/Skeletons";
import { SwipeableRow } from "@/components/SwipeableRow";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EditLineItemDialog } from "@/components/EditLineItemDialog";
import { EditTransactionDialog } from "@/components/EditTransactionDialog";
import { formatCents } from "@/lib/utils";
import { parseISODate } from "@/lib/dates";
import { setPendingReceipt } from "@/lib/scanFile";

type DeleteTarget = { kind: "transaction" } | { kind: "item"; item: LineItem };

/**
 * Transaction detail (user-flow §7): header + line-item table. No photo is ever shown
 * (deleted on confirm by design). Vendor/date/tax/tip are editable via the header pencil;
 * each item is editable/removable by swiping it left. Every delete is confirmed first —
 * the trash can never fires immediately.
 */
export default function TransactionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: txn, isLoading } = useTransaction(id);
  const scanInput = useRef<HTMLInputElement>(null);

  const del = useDeleteTransaction();
  const updateTxn = useUpdateTransaction();
  const updateItem = useUpdateLineItem();
  const deleteItem = useDeleteLineItem();

  const [editingTxn, setEditingTxn] = useState(false);
  const [editingItem, setEditingItem] = useState<LineItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  async function confirmDelete() {
    if (!deleteTarget || !id) return;
    if (deleteTarget.kind === "transaction") {
      await del.mutateAsync(id);
      toast.success("Transaction deleted");
      navigate("/transactions");
      return;
    }
    await deleteItem.mutateAsync({ transactionId: id, itemId: deleteTarget.item.id });
    toast.success("Item removed");
    setDeleteTarget(null);
  }

  async function saveTransaction(values: {
    vendor: string;
    purchased_on: string;
    tax_cents: number;
    tip_cents: number;
  }) {
    if (!id) return;
    await updateTxn.mutateAsync({ id, ...values });
    toast.success("Transaction updated");
    setEditingTxn(false);
  }

  async function saveItem(values: {
    normalized_name: string;
    category_id: string | null;
    price_cents: number;
  }) {
    if (!id || !editingItem) return;
    await updateItem.mutateAsync({ transactionId: id, itemId: editingItem.id, ...values });
    toast.success("Item updated");
    setEditingItem(null);
  }

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

  const deleteCopy =
    deleteTarget?.kind === "transaction"
      ? {
          title: "Delete transaction?",
          description: "Removes this transaction and all its items. Can't be undone.",
        }
      : deleteTarget?.kind === "item"
        ? {
            title: "Remove item?",
            description: `Removes "${deleteTarget.item.normalized_name ?? deleteTarget.item.raw_name}" from this transaction. Can't be undone.`,
          }
        : { title: "", description: "" };

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
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{txn.vendor}</h1>
          <p className="text-sm text-muted-foreground">
            {format(parseISODate(txn.purchased_on), "EEEE, MMM d, yyyy")} · {txn.source}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setEditingTxn(true)}
          aria-label="Edit transaction"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDeleteTarget({ kind: "transaction" })}
          aria-label="Delete transaction"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {txn.line_items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border">
          <ul className="divide-y">
            {txn.line_items.map((li) => (
              <li key={li.id}>
                <SwipeableRow
                  actions={
                    <>
                      <button
                        type="button"
                        aria-label={`Edit ${li.normalized_name ?? li.raw_name}`}
                        onClick={() => setEditingItem(li)}
                        className="flex h-full w-16 items-center justify-center bg-muted text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${li.normalized_name ?? li.raw_name}`}
                        onClick={() => setDeleteTarget({ kind: "item", item: li })}
                        className="flex h-full w-16 items-center justify-center bg-destructive text-destructive-foreground"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  }
                >
                  <div className="flex items-center justify-between bg-background px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium">
                        {li.normalized_name ?? li.raw_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {li.category_name ?? "Uncategorized"}
                      </p>
                    </div>
                    <span className="text-sm">{formatCents(li.price_cents)}</span>
                  </div>
                </SwipeableRow>
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

      <EditTransactionDialog
        open={editingTxn}
        txn={txn}
        onOpenChange={setEditingTxn}
        onSave={saveTransaction}
        pending={updateTxn.isPending}
      />
      <EditLineItemDialog
        item={editingItem}
        onOpenChange={(open) => !open && setEditingItem(null)}
        onSave={saveItem}
        pending={updateItem.isPending}
      />
      <ConfirmDeleteDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteCopy.title}
        description={deleteCopy.description}
        onConfirm={confirmDelete}
        pending={del.isPending || deleteItem.isPending}
      />
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
