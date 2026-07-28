import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToInput, dollarsToCents } from "@/lib/utils";
import type { TransactionDetail } from "@/api/types";

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
  onSave: (values: {
    vendor: string;
    purchased_on: string;
    tax_cents: number;
    tip_cents: number;
  }) => void;
  pending?: boolean;
}) {
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState("");
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");

  // Reset fields whenever the dialog is (re)opened for this transaction.
  useEffect(() => {
    if (open && txn) {
      setVendor(txn.vendor);
      setDate(txn.purchased_on);
      setTax(centsToInput(txn.tax_cents));
      setTip(centsToInput(txn.tip_cents));
    }
  }, [open, txn]);

  // Tax/tip only mean something when there's a tracked line-item subtotal to add them to —
  // an unitemized (e.g. bank) transaction's total has no separable principal (see backend
  // TransactionUpdate). The API silently ignores tax/tip in that case; hiding the fields
  // here keeps the UI honest about what editing will actually do.
  const itemized = txn?.subtotal_cents != null;
  const canSave = vendor.trim().length > 0 && date.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="txn-vendor">Vendor</Label>
            <Input id="txn-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="txn-date">Date</Label>
            <Input
              id="txn-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {itemized && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="txn-tax">Tax</Label>
                <Input
                  id="txn-tax"
                  inputMode="decimal"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="txn-tip">Tip</Label>
                <Input
                  id="txn-tip"
                  inputMode="decimal"
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSave || pending}
            onClick={() =>
              onSave({
                vendor: vendor.trim(),
                purchased_on: date,
                tax_cents: dollarsToCents(tax) ?? 0,
                tip_cents: dollarsToCents(tip) ?? 0,
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
