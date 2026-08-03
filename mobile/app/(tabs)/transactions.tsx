import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import { Button, H2, Paragraph, Separator, XStack, YStack } from "tamagui";

import {
  useDeleteTransaction,
  useSetTransactionHidden,
  useTransaction,
  useTransactions,
  useUpdateTransaction,
} from "@shared/api/hooks";
import type { TransactionListItem } from "@shared/api/types";
import { parseISODate } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";
import { EditTransactionDialog, type EditTransactionValues } from "@/components/EditTransactionDialog";
import { TransactionRow } from "@/components/TransactionRow";
import {
  AppSheet,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Screen,
  SheetRow,
  useToast,
} from "@/components/ui";
import { groupByDay } from "@/lib/groupTransactions";

type Filter = "all" | "needs_review";

/**
 * Transactions — the browsable ledger (user-flow §5), grouped by day.
 * Row tap → detail. Long press → the action sheet (Edit / Hide / Delete).
 *
 * Native-first difference: web exposed a ⋯ button per row. Here a long press opens the same
 * sheet, which is the platform gesture for "act on this item" and keeps the row uncluttered.
 */
export default function TransactionsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useTransactions();
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
  const visible = filter === "needs_review" ? all.filter((t) => t.review_status === "needs_review") : all;
  const groups = groupByDay(visible);

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

  return (
    <Screen testID="transactions-screen">
      <XStack alignItems="center" justifyContent="space-between">
        <H2>Transactions</H2>
        <Button size="$3" onPress={() => router.push("/add")} testID="add-transaction">
          <XStack alignItems="center" gap="$1.5">
            <Feather name="plus" size={14} />
            <Paragraph size="$2">Add</Paragraph>
          </XStack>
        </Button>
      </XStack>

      {/* The filter only appears when there IS a queue — matching web, so the control doesn't
          advertise a state that can't currently exist. */}
      {reviewCount > 0 ? (
        <XStack gap="$2">
          <FilterChip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
          <FilterChip
            label={`Needs review (${reviewCount})`}
            active={filter === "needs_review"}
            onPress={() => setFilter("needs_review")}
          />
        </XStack>
      ) : null}

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : isError ? (
        <ErrorState message="Couldn't load transactions." onRetry={() => void refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          title={filter === "needs_review" ? "Nothing needs review" : "No transactions yet"}
          message={filter === "needs_review" ? undefined : "Add a purchase or scan a receipt."}
          actionLabel={filter === "needs_review" ? undefined : "Add a purchase"}
          onAction={filter === "needs_review" ? undefined : () => router.push("/add")}
        />
      ) : (
        <YStack gap="$4">
          {groups.map(({ day, items }) => (
            <YStack key={day} gap="$1.5">
              <Paragraph size="$1" theme="alt2" textTransform="uppercase" fontWeight="600">
                {format(parseISODate(day), "EEEE, MMM d")}
              </Paragraph>
              <Card flat padding="$0">
                {items.map((t, i) => (
                  <YStack key={t.id} opacity={t.hidden ? 0.5 : 1}>
                    {i > 0 ? <Separator /> : null}
                    <TransactionRow
                      transaction={t}
                      onPress={() => router.push(`/transactions/${t.id}`)}
                      onLongPress={() => setMenuTxn(t)}
                    />
                  </YStack>
                ))}
              </Card>
            </YStack>
          ))}
        </YStack>
      )}

      <AppSheet open={menuTxn != null} onOpenChange={(o) => !o && setMenuTxn(null)} snapPoints={[40]}>
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
        onOpenChange={(o) => !o && setEditingId(null)}
        onSave={saveTransaction}
        pending={updateTxn.isPending || (editingId != null && !editingDetail)}
      />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete transaction?"
        description={
          deleting ? `Removes "${deleting.vendor}" and all its items. Can't be undone.` : undefined
        }
        confirmLabel={del.isPending ? "Deleting…" : "Delete"}
        onConfirm={() => void confirmDelete()}
      />
    </Screen>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      size="$2"
      theme={active ? "active" : undefined}
      chromeless={!active}
      onPress={onPress}
      accessibilityState={{ selected: active }}
    >
      {label}
    </Button>
  );
}
