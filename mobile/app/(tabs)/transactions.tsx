import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { H2, Paragraph, XStack, YStack } from "tamagui";

import {
  useDeleteTransaction,
  useSetTransactionHidden,
  useTransaction,
  useTransactions,
  useUpdateTransaction,
} from "@shared/api/hooks";
import type { TransactionListItem } from "@shared/api/types";
import { formatCents } from "@shared/lib/money";
import { EditTransactionDialog, type EditTransactionValues } from "@/components/EditTransactionDialog";
import { TransactionDayGroups } from "@/components/TransactionDayGroups";
import {
  AppSheet,
  Button,
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
 * Row tap → detail. The ⋮ button or a long press → the action sheet (Edit / Hide / Delete).
 *
 * This screen also owns *adding* a transaction. All three ways in live behind one Add button:
 * typing it yourself, photographing a receipt, or picking a photo you already took. Scanning
 * used to be a bottom tab, which framed it as a destination and hid the other two; it is
 * really just one source among three, so it belongs here next to its siblings.
 */
export default function TransactionsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useTransactions();
  const [filter, setFilter] = useState<Filter>("all");

  const [menuTxn, setMenuTxn] = useState<TransactionListItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
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
        <Button
          variant="secondary"
          size="sm"
          icon={<Feather name="plus" size={14} />}
          onPress={() => setAddOpen(true)}
          testID="add-transaction"
        >
          Add
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
        <TransactionDayGroups
          items={visible}
          onPressItem={(t) => router.push(`/transactions/${t.id}`)}
          onOpenMenu={setMenuTxn}
        />
      )}

      {/* The three ways to add a transaction. Ordered fastest-first for the common case:
          most entries are typed, and a receipt you just bought is more likely to be
          photographed now than found in the library later. */}
      <AppSheet open={addOpen} onOpenChange={setAddOpen} snapPoints={[40]}>
        <YStack gap="$1">
          <Paragraph fontWeight="700" size="$5">
            Add a transaction
          </Paragraph>
          <Paragraph theme="alt2" size="$2">
            Type it in, or let us read a receipt for you.
          </Paragraph>
        </YStack>

        <SheetRow
          label="Enter manually"
          testID="add-manual"
          icon={<Feather name="edit-3" size={18} />}
          onPress={() => {
            setAddOpen(false);
            router.push("/add");
          }}
        />
        <SheetRow
          label="Scan a receipt"
          testID="add-scan-camera"
          icon={<Feather name="camera" size={18} />}
          onPress={() => {
            setAddOpen(false);
            router.push("/scan?source=camera");
          }}
        />
        <SheetRow
          label="Choose from library"
          testID="add-scan-library"
          icon={<Feather name="image" size={18} />}
          onPress={() => {
            setAddOpen(false);
            router.push("/scan?source=library");
          }}
        />
      </AppSheet>

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
      variant={active ? "primary" : "ghost"}
      size="sm"
      onPress={onPress}
      accessibilityLabel={label}
    >
      {label}
    </Button>
  );
}
