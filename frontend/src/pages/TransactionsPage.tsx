import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Plus,
  Camera,
  Pencil,
  Landmark,
  MoreHorizontal,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  useTransactions,
  useTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
  useSetTransactionHidden,
} from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { cn, formatCents } from "@/lib/utils";
import { CategoryChips } from "@/components/CategoryChips";
import { ListSkeleton } from "@/components/Skeletons";
import { ActionSheet } from "@/components/ActionSheet";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EditTransactionDialog } from "@/components/EditTransactionDialog";
import { parseISODate } from "@/lib/dates";
import type { TransactionListItem, TransactionSource } from "@/api/types";

type Filter = "all" | "needs_review";

const SOURCE_ICON: Record<TransactionSource, typeof Camera> = {
  receipt: Camera,
  manual: Pencil,
  plaid: Landmark,
};

function groupByDay(txns: TransactionListItem[]): [string, TransactionListItem[]][] {
  const groups = new Map<string, TransactionListItem[]>();
  for (const t of txns) {
    const arr = groups.get(t.purchased_on) ?? [];
    arr.push(t);
    groups.set(t.purchased_on, arr);
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

/** Transactions — the browsable ledger (user-flow §5), grouped by day.
 *  Row tap → detail. ⋯ menu → Edit / Hide / Delete via a bottom action sheet. */
export default function TransactionsPage() {
  const { data, isLoading } = useTransactions();
  const [filter, setFilter] = useState<Filter>("all");

  const [menuTxn, setMenuTxn] = useState<TransactionListItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TransactionListItem | null>(null);

  const { data: editingDetail } = useTransaction(editingId ?? undefined);
  const del = useDeleteTransaction();
  const updateTxn = useUpdateTransaction();
  const setHidden = useSetTransactionHidden();

  const all = data ?? [];
  const reviewCount = all.filter((t) => t.review_status === "needs_review").length;
  const visible =
    filter === "needs_review"
      ? all.filter((t) => t.review_status === "needs_review")
      : all;
  const groups = groupByDay(visible);

  async function saveTransaction(values: {
    vendor: string;
    purchased_on: string;
    tax_cents: number;
    tip_cents: number;
  }) {
    if (!editingId) return;
    await updateTxn.mutateAsync({ id: editingId, ...values });
    toast.success("Transaction updated");
    setEditingId(null);
  }

  async function confirmDelete() {
    if (!deleting) return;
    await del.mutateAsync(deleting.id);
    toast.success("Transaction deleted");
    setDeleting(null);
  }

  async function toggleHidden(txn: TransactionListItem) {
    await setHidden.mutateAsync({ id: txn.id, hidden: !txn.hidden });
    toast.success(txn.hidden ? "Shown in spending again" : "Hidden from spending");
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <Button asChild size="sm">
          <Link to="/add">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Link>
        </Button>
      </div>

      {/* Filter (user-flow §5). The 'Needs review' toggle only appears when there's a queue. */}
      {reviewCount > 0 && (
        <div className="inline-flex rounded-lg border p-1 text-sm">
          {(["all", "needs_review"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {f === "all" ? "All" : `Needs review (${reviewCount})`}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : groups.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {filter === "needs_review" ? (
            "Nothing needs review."
          ) : (
            <>
              No transactions yet.{" "}
              <Link to="/add" className="text-primary hover:underline">
                Add one
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <div key={day}>
              <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {format(parseISODate(day), "EEEE, MMM d")}
              </h2>
              <ul className="divide-y rounded-xl border">
                {items.map((t) => {
                  const Icon = SOURCE_ICON[t.source];
                  return (
                    <li key={t.id} className="flex items-stretch">
                      <Link
                        to={`/transactions/${t.id}`}
                        className={cn(
                          "flex min-w-0 flex-1 items-center justify-between px-4 py-3 hover:bg-muted/40",
                          t.hidden && "opacity-50",
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{t.vendor}</p>
                            <p className="text-xs text-muted-foreground">
                              {t.item_count > 0
                                ? `${t.item_count} item${t.item_count === 1 ? "" : "s"}`
                                : "Uncategorized"}
                              {t.review_status === "needs_review" && " · needs review"}
                              {t.pending && " · pending"}
                              {t.hidden && " · hidden from spending"}
                            </p>
                            <CategoryChips categories={t.categories} />
                          </div>
                        </div>
                        <span className="shrink-0 pl-3 font-medium">
                          {formatCents(t.total_cents, t.currency)}
                        </span>
                      </Link>
                      <button
                        type="button"
                        aria-label={`Actions for ${t.vendor}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuTxn(t);
                        }}
                        className="flex shrink-0 items-center px-3 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <ActionSheet
        open={menuTxn != null}
        onOpenChange={(open) => !open && setMenuTxn(null)}
        title={menuTxn?.vendor}
        description={
          menuTxn
            ? formatCents(menuTxn.total_cents, menuTxn.currency)
            : undefined
        }
        actions={
          menuTxn
            ? [
                {
                  label: "Edit",
                  icon: <Pencil className="h-4 w-4" />,
                  onSelect: () => {
                    const id = menuTxn.id;
                    setMenuTxn(null);
                    setEditingId(id);
                  },
                },
                {
                  label: menuTxn.hidden ? "Unhide from spending" : "Hide from spending",
                  icon: menuTxn.hidden ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  ),
                  disabled: setHidden.isPending,
                  onSelect: () => {
                    const t = menuTxn;
                    setMenuTxn(null);
                    void toggleHidden(t);
                  },
                },
                {
                  label: "Delete",
                  icon: <Trash2 className="h-4 w-4" />,
                  destructive: true,
                  onSelect: () => {
                    const t = menuTxn;
                    setMenuTxn(null);
                    setDeleting(t);
                  },
                },
              ]
            : []
        }
      />

      <EditTransactionDialog
        open={editingId != null}
        txn={editingDetail ?? null}
        onOpenChange={(open) => !open && setEditingId(null)}
        onSave={saveTransaction}
        pending={updateTxn.isPending || (editingId != null && !editingDetail)}
      />

      <ConfirmDeleteDialog
        open={deleting != null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete transaction?"
        description={
          deleting
            ? `Removes "${deleting.vendor}" and all its items. Can't be undone.`
            : ""
        }
        onConfirm={confirmDelete}
        pending={del.isPending}
      />
    </section>
  );
}
