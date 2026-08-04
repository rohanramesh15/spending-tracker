import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { Paragraph, YStack } from "tamagui";

import {
  useDeleteTransaction,
  useSetTransactionHidden,
  useTransaction,
  useUpdateTransaction,
} from "@shared/api/hooks";
import type { TransactionListItem } from "@shared/api/types";
import { formatCents } from "@shared/lib/money";
import {
  EditTransactionDialog,
  type EditTransactionValues,
} from "@/components/EditTransactionDialog";
import { AppSheet, ConfirmDialog, SheetRow, useToast } from "@/components/ui";

/**
 * Edit / Hide / Delete for a transaction: the action sheet, the edit dialog and the delete
 * confirmation, plus every mutation behind them.
 *
 * Extracted because Home and Transactions both show the full ledger and must offer the same
 * actions. Duplicating ~90 lines of sheet, dialogs and mutations across two screens is how they
 * drift — one gains a confirmation step or a different toast and nobody notices.
 *
 * Usage: spread `openMenu` into a list's `onOpenMenu`, and render `overlays` once in the screen.
 *
 *   const actions = useTransactionActions();
 *   <TransactionDayGroups items={items} onOpenMenu={actions.openMenu} />
 *   {actions.overlays}
 */
export function useTransactionActions() {
  const toast = useToast();
  const [menuTxn, setMenuTxn] = useState<TransactionListItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TransactionListItem | null>(null);

  const { data: editingDetail } = useTransaction(editingId ?? undefined);
  const del = useDeleteTransaction();
  const updateTxn = useUpdateTransaction();
  const setHidden = useSetTransactionHidden();

  async function saveTransaction(values: EditTransactionValues) {
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

  const overlays = (
    <>
      <AppSheet open={menuTxn != null} onOpenChange={(o) => !o && setMenuTxn(null)}>
        {menuTxn ? (
          <>
            <YStack gap="$1">
              <Paragraph fontWeight="700" size="$5">
                {menuTxn.vendor}
              </Paragraph>
              <Paragraph theme="alt2">
                {formatCents(menuTxn.total_cents, menuTxn.currency)}
              </Paragraph>
            </YStack>

            <SheetRow
              label="Edit"
              testID="action-edit"
              icon={<Feather name="edit-2" size={18} />}
              onPress={() => {
                const id = menuTxn.id;
                setMenuTxn(null);
                setEditingId(id);
              }}
            />
            <SheetRow
              label={menuTxn.hidden ? "Unhide from spending" : "Hide from spending"}
              testID="action-hide"
              icon={<Feather name={menuTxn.hidden ? "eye" : "eye-off"} size={18} />}
              onPress={() => {
                const t = menuTxn;
                setMenuTxn(null);
                void toggleHidden(t);
              }}
            />
            <SheetRow
              label="Delete"
              testID="action-delete"
              destructive
              icon={<Feather name="trash-2" size={18} color="#e34948" />}
              onPress={() => {
                const t = menuTxn;
                setMenuTxn(null);
                setDeleting(t);
              }}
            />
          </>
        ) : null}
      </AppSheet>

      <EditTransactionDialog
        open={editingId != null}
        txn={editingDetail ?? null}
        onOpenChange={(o: boolean) => !o && setEditingId(null)}
        onSave={saveTransaction}
        pending={updateTxn.isPending || (editingId != null && !editingDetail)}
      />

      {/* Deleting is irreversible, so it is always confirmed — never a one-tap action. */}
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o: boolean) => !o && setDeleting(null)}
        title="Delete transaction?"
        description={
          deleting ? `Removes "${deleting.vendor}" and all its items. Can't be undone.` : undefined
        }
        confirmLabel={del.isPending ? "Deleting…" : "Delete"}
        destructive
        onConfirm={() => void confirmDelete()}
      />
    </>
  );

  return { openMenu: setMenuTxn, overlays };
}
