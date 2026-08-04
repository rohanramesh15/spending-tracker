import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { Paragraph, XStack, YStack } from "tamagui";

import { useTransactions } from "@shared/api/hooks";
import type { TransactionListItem } from "@shared/api/types";
import { formatCents } from "@shared/lib/money";
import { TransactionDayGroups } from "@/components/TransactionDayGroups";
import { useTransactionActions } from "@/components/useTransactionActions";
import { searchTransactions } from "@/lib/searchTransactions";
import { AppSheet, Button, Card, ConfirmDialog, EmptyState, ErrorState, ListSkeleton, PageHeader, Screen, SearchField, SheetList, SheetRow, useToast } from "@/components/ui";
import { groupByDay } from "@/lib/groupTransactions";

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
  const [queryText, setQueryText] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const actions = useTransactionActions();

  const all = data ?? [];
  const visible = searchTransactions(all, queryText);
  const groups = groupByDay(visible);




  return (
    <Screen
      testID="transactions-screen"
      collapsingHeader={
        <YStack gap="$3">
          <PageHeader
            title="Transactions"
            right={
              <Button
                variant="ghost"
                circular
                icon={<Feather name="plus" size={22} />}
                accessibilityLabel="Add a transaction"
                onPress={() => setAddOpen(true)}
                testID="add-transaction"
              />
            }
          />

          {/* Search replaces the All / Needs review chips. Those answered exactly one question;
              this answers that one too ("needs review" is a searchable term) plus vendor, amount,
              date and category — which is what people actually remember about a purchase. */}
          <SearchField
            value={queryText}
            onChangeText={setQueryText}
            placeholder="Search vendor, amount, date…"
            testID="transaction-search"
          />
        </YStack>
      }
    >

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : isError ? (
        <ErrorState message="Couldn't load transactions." onRetry={() => void refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          title={queryText ? "No matches" : "No transactions yet"}
          message={
            queryText
              ? `Nothing matches "${queryText}".`
              : "Add a purchase or scan a receipt."
          }
          actionLabel={queryText ? undefined : "Add a purchase"}
          onAction={queryText ? undefined : () => router.push("/add")}
        />
      ) : (
        <TransactionDayGroups
          items={visible}
          onPressItem={(t) => router.push(`/transactions/${t.id}`)}
          onOpenMenu={actions.openMenu}
        />
      )}

      {/* The three ways to add a transaction. Ordered fastest-first for the common case:
          most entries are typed, and a receipt you just bought is more likely to be
          photographed now than found in the library later. */}
      <AppSheet open={addOpen} onOpenChange={setAddOpen} title="Add a transaction">
        <SheetList>
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
        </SheetList>
      </AppSheet>

      {actions.overlays}
    </Screen>
  );
}

