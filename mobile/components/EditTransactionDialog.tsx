import { useEffect, useState } from "react";
import { AlertDialog, Button, XStack, YStack } from "tamagui";

import type { TransactionDetail } from "@shared/api/types";
import { centsToInput, dollarsToCents } from "@shared/lib/money";
import { Field, TextField } from "@/components/ui";

export interface EditTransactionValues {
  vendor: string;
  purchased_on: string;
  tax_cents: number;
  tip_cents: number;
}

/**
 * Edit a transaction's header fields. Ported from the web dialog.
 *
 * Tax and tip are hidden for an unitemized transaction, matching web: they only mean something
 * when there's a tracked line-item subtotal to add them to. The API silently ignores them
 * otherwise, so showing the fields would imply an edit that never happens.
 */
export function EditTransactionDialog({
  open,
  txn,
  onOpenChange,
  onSave,
  pending,
}: {
  open: boolean;
  txn: TransactionDetail | null | undefined;
  onOpenChange: (open: boolean) => void;
  onSave: (values: EditTransactionValues) => void;
  pending?: boolean;
}) {
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState("");
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");

  // Reset whenever the dialog is (re)opened for this transaction.
  useEffect(() => {
    if (open && txn) {
      setVendor(txn.vendor);
      setDate(txn.purchased_on);
      setTax(centsToInput(txn.tax_cents));
      setTip(centsToInput(txn.tip_cents));
    }
  }, [open, txn]);

  const itemized = txn?.subtotal_cents != null;
  const canSave = vendor.trim().length > 0 && date.length > 0 && !pending;

  function submit() {
    onSave({
      vendor: vendor.trim(),
      purchased_on: date,
      // Money is integer cents everywhere (CLAUDE.md #1); an unparseable field means "no change
      // from zero" rather than NaN reaching the API.
      tax_cents: itemized ? (dollarsToCents(tax) ?? 0) : 0,
      tip_cents: itemized ? (dollarsToCents(tip) ?? 0) : 0,
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay key="overlay" opacity={0.5} />
        <AlertDialog.Content key="content" bordered elevate gap="$3" width="90%" maxWidth={400}>
          <AlertDialog.Title>Edit transaction</AlertDialog.Title>

          <YStack gap="$3">
            <Field label="Vendor" required>
              <TextField value={vendor} onChangeText={setVendor} testID="edit-vendor" />
            </Field>
            <Field label="Date" required>
              <TextField
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                testID="edit-date"
              />
            </Field>

            {itemized ? (
              <XStack gap="$3">
                <YStack flex={1}>
                  <Field label="Tax">
                    <TextField
                      value={tax}
                      onChangeText={setTax}
                      inputMode="decimal"
                      testID="edit-tax"
                    />
                  </Field>
                </YStack>
                <YStack flex={1}>
                  <Field label="Tip">
                    <TextField
                      value={tip}
                      onChangeText={setTip}
                      inputMode="decimal"
                      testID="edit-tip"
                    />
                  </Field>
                </YStack>
              </XStack>
            ) : null}
          </YStack>

          <XStack gap="$3" justifyContent="flex-end">
            <AlertDialog.Cancel asChild>
              <Button size="$3" chromeless>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              size="$3"
              theme="active"
              disabled={!canSave}
              opacity={canSave ? 1 : 0.5}
              onPress={submit}
              testID="edit-save"
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </XStack>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog>
  );
}
