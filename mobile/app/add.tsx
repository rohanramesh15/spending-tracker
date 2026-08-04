import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { Paragraph, XStack, YStack } from "tamagui";

import { useIngest } from "@shared/api/hooks";
import type { IngestRequest, IngestResult, ReconcileMatch, Resolution } from "@shared/api/types";
import { todayISO } from "@shared/lib/dates";
import { dollarsToCents, formatCents } from "@shared/lib/money";
import { CategorySelect } from "@/components/CategorySelect";
import { ReconcileDialog } from "@/components/ReconcileDialog";
import { Button, Card, Field, PageTitle, Screen, TextField, useToast } from "@/components/ui";
import {
  buildIngestPayload,
  itemizedTotalCents,
  type ItemRow,
  type ManualEntryInput,
} from "@/lib/manualEntry";

/**
 * Manual entry (user-flow §4). Quick-add is the default; itemized mode reveals editable rows
 * plus tax/tip with a derived total.
 *
 * Payload construction and validation live in lib/manualEntry so they're tested directly —
 * this screen is the form around them.
 */
export default function ManualEntryScreen() {
  const router = useRouter();
  const toast = useToast();
  const ingest = useIngest();

  const [mode, setMode] = useState<"quick" | "itemized">("quick");
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(todayISO());
  const [total, setTotal] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [rows, setRows] = useState<ItemRow[]>([{ name: "", amount: "", categoryId: null }]);
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<ReconcileMatch | null>(null);

  const form: ManualEntryInput = { mode, vendor, date, total, category, rows, tax, tip };
  const itemizedTotal = itemizedTotalCents({ rows, tax, tip });
  const incomingTotal = mode === "quick" ? (dollarsToCents(total) ?? 0) : itemizedTotal;

  function announce(payload: IngestRequest, result: IngestResult, resolution?: Resolution) {
    const msg =
      resolution === "merge"
        ? "Added to your existing entry"
        : resolution === "replace"
          ? "Replaced your existing entry"
          : result.status === "skipped"
            ? "Kept your existing entry"
            : `Saved — ${payload.vendor}, ${formatCents(payload.total_cents)}`;
    toast.success(msg);
    router.replace("/transactions");
  }

  async function submit(payload: IngestRequest, resolution?: Resolution) {
    try {
      const result = await ingest.mutateAsync(payload);
      // Never auto-merge (CLAUDE.md #5): a collision stops here and asks.
      if (result.status === "needs_decision" && result.match) {
        setPendingMatch(result.match);
        return;
      }
      setPendingMatch(null);
      announce(payload, result, resolution);
    } catch (e) {
      setPendingMatch(null);
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function save() {
    const payload = buildIngestPayload(form);
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setError(null);
    await submit(payload);
  }

  async function resolve(resolution: Resolution) {
    const payload = buildIngestPayload(form);
    if (typeof payload === "string" || !pendingMatch) return;
    await submit(
      { ...payload, resolution, matched_transaction_id: pendingMatch.matched_transaction_id },
      resolution,
    );
  }

  function updateRow(index: number, patch: Partial<ItemRow>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <Screen testID="manual-entry">
      <XStack alignItems="center" gap="$2">
        <Button
          variant="ghost"
          circular
          icon={<Feather name="arrow-left" size={20} />}
          accessibilityLabel="Back"
          onPress={() => router.back()}
        />
        <PageTitle>Add manually</PageTitle>
      </XStack>

      <XStack gap="$2">
        <ModeChip label="Quick" active={mode === "quick"} onPress={() => setMode("quick")} />
        <ModeChip
          label="Itemized"
          active={mode === "itemized"}
          onPress={() => setMode("itemized")}
        />
      </XStack>

      <Field label="Vendor" required>
        <TextField
          value={vendor}
          onChangeText={setVendor}
          placeholder="e.g. Kroger"
          testID="vendor"
        />
      </Field>

      <Field label="Date" required>
        <TextField value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" testID="date" />
      </Field>

      {mode === "quick" ? (
        <>
          <Field label="Total" required>
            <TextField
              value={total}
              onChangeText={setTotal}
              inputMode="decimal"
              placeholder="0.00"
              testID="total"
            />
          </Field>
          <Field label="Category" required>
            <CategorySelect value={category} onChange={setCategory} />
          </Field>
        </>
      ) : (
        <YStack gap="$3">
          <Paragraph fontWeight="600">Items</Paragraph>

          {rows.map((r, i) => (
            <Card key={i} gap="$2">
              <XStack gap="$2" alignItems="center">
                <YStack flex={1}>
                  <TextField
                    value={r.name}
                    onChangeText={(name) => updateRow(i, { name })}
                    placeholder="Item"
                    testID={`item-name-${i}`}
                  />
                </YStack>
                <YStack width={96}>
                  <TextField
                    value={r.amount}
                    onChangeText={(amount) => updateRow(i, { amount })}
                    inputMode="decimal"
                    placeholder="0.00"
                    testID={`item-amount-${i}`}
                  />
                </YStack>
                <Button
                  variant="ghost"
                  size="sm"
                  circular
                  icon={<Feather name="trash-2" size={16} />}
                  accessibilityLabel="Remove item"
                  testID={`item-remove-${i}`}
                  onPress={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                />
              </XStack>
              <CategorySelect
                value={r.categoryId}
                onChange={(categoryId) => updateRow(i, { categoryId })}
                testID={`item-category-${i}`}
              />
            </Card>
          ))}

          <Button
            variant="ghost"
            size="sm"
            icon={<Feather name="plus" size={14} />}
            testID="add-item"
            onPress={() => setRows((rs) => [...rs, { name: "", amount: "", categoryId: null }])}
          >
            Add item
          </Button>

          <XStack gap="$3">
            <YStack flex={1}>
              <Field label="Tax">
                <TextField
                  value={tax}
                  onChangeText={setTax}
                  inputMode="decimal"
                  placeholder="0.00"
                  testID="tax"
                />
              </Field>
            </YStack>
            <YStack flex={1}>
              <Field label="Tip">
                <TextField
                  value={tip}
                  onChangeText={setTip}
                  inputMode="decimal"
                  placeholder="0.00"
                  testID="tip"
                />
              </Field>
            </YStack>
          </XStack>

          <Card flat backgroundColor="$color3">
            <XStack justifyContent="space-between">
              <Paragraph fontWeight="600">Total</Paragraph>
              <Paragraph fontWeight="600" testID="derived-total">
                {formatCents(itemizedTotal)}
              </Paragraph>
            </XStack>
          </Card>
        </YStack>
      )}

      {error ? (
        <Paragraph color="$red10" accessibilityRole="alert" testID="entry-error">
          {error}
        </Paragraph>
      ) : null}

      <Button
        variant="primary"
        fullWidth
        loading={ingest.isPending}
        onPress={() => void save()}
        testID="save"
      >
        {ingest.isPending ? "Saving…" : "Save"}
      </Button>

      <ReconcileDialog
        match={pendingMatch}
        incoming={{ vendor: vendor.trim(), total_cents: incomingTotal }}
        busy={ingest.isPending}
        onResolve={(r) => void resolve(r)}
        onCancel={() => setPendingMatch(null)}
      />
    </Screen>
  );
}

function ModeChip({
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
