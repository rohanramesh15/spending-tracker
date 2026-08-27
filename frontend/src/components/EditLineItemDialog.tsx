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
import { CategorySelect } from "@/components/CategorySelect";
import { centsToInput, dollarsToCents } from "@shared/lib/money";
import type { LineItem } from "@shared/api/types";

export function EditLineItemDialog({
  item,
  onOpenChange,
  onSave,
  pending,
}: {
  /** The item being edited, or null when the dialog is closed. */
  item: LineItem | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: { normalized_name: string; category_id: string | null; price_cents: number }) => void;
  pending?: boolean;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  // Reset the form fields whenever a (different) item is opened for editing.
  useEffect(() => {
    if (item) {
      setName(item.normalized_name ?? item.raw_name);
      setCategoryId(item.category_id);
      setAmount(centsToInput(item.price_cents));
    }
  }, [item]);

  const priceCents = dollarsToCents(amount);
  const canSave = name.trim().length > 0 && priceCents != null;

  return (
    <Dialog open={item != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="item-name">Name</Label>
            <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <CategorySelect value={categoryId} onChange={setCategoryId} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-price">Price</Label>
            <Input
              id="item-price"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSave || pending}
            onClick={() =>
              onSave({ normalized_name: name.trim(), category_id: categoryId, price_cents: priceCents! })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
