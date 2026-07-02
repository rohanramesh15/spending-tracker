import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategorySelect } from "@/components/CategorySelect";
import { useIngest } from "@/api/hooks";
import type { IngestRequest } from "@/api/types";
import { dollarsToCents, formatCents } from "@/lib/utils";
import { todayISO } from "@/lib/dates";

interface Row {
  name: string;
  amount: string; // dollars
  categoryId: string | null;
}

/**
 * Manual entry (user-flow §4). Quick-add is the default (vendor, total, date, one
 * category — stored as a single-line-item transaction so the chart treats it as
 * itemized). Itemized toggle reveals editable rows + tax/tip; the total is derived.
 */
export default function ManualEntryPage() {
  const navigate = useNavigate();
  const ingest = useIngest();

  const [mode, setMode] = useState<"quick" | "itemized">("quick");
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(todayISO());

  // Quick
  const [total, setTotal] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  // Itemized
  const [rows, setRows] = useState<Row[]>([{ name: "", amount: "", categoryId: null }]);
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");

  const itemsCents = rows.reduce((sum, r) => sum + (dollarsToCents(r.amount) ?? 0), 0);
  const taxCents = dollarsToCents(tax) ?? 0;
  const tipCents = dollarsToCents(tip) ?? 0;
  const itemizedTotal = itemsCents + taxCents + tipCents;

  const [error, setError] = useState<string | null>(null);

  function buildPayload(): IngestRequest | string {
    if (!vendor.trim()) return "Add a vendor.";
    if (mode === "quick") {
      const cents = dollarsToCents(total);
      if (cents === null || cents <= 0) return "Enter a valid total.";
      if (!category) return "Pick a category.";
      return {
        source: "manual",
        vendor: vendor.trim(),
        purchased_on: date,
        subtotal_cents: cents,
        total_cents: cents,
        line_items: [{ raw_name: vendor.trim(), category_id: category, price_cents: cents }],
      };
    }
    const items = rows.filter((r) => r.name.trim() && dollarsToCents(r.amount));
    if (items.length === 0) return "Add at least one item with a name and price.";
    return {
      source: "manual",
      vendor: vendor.trim(),
      purchased_on: date,
      subtotal_cents: itemsCents,
      tax_cents: taxCents,
      tip_cents: tipCents,
      total_cents: itemizedTotal,
      line_items: items.map((r) => ({
        raw_name: r.name.trim(),
        category_id: r.categoryId,
        price_cents: dollarsToCents(r.amount)!,
      })),
    };
  }

  async function save() {
    const payload = buildPayload();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setError(null);
    try {
      await ingest.mutateAsync(payload);
      toast.success(`Saved — ${vendor}, ${formatCents(payload.total_cents)}`);
      navigate("/transactions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Add manually</h1>
      </div>

      {/* mode toggle */}
      <div className="inline-flex rounded-lg border p-1 text-sm">
        {(["quick", "itemized"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={
              "rounded-md px-3 py-1 capitalize " +
              (mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")
            }
          >
            {m}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="vendor">Vendor</Label>
          <Input id="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Kroger" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {mode === "quick" && (
          <div className="space-y-2">
            <Label htmlFor="total">Total</Label>
            <Input id="total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0.00" />
          </div>
        )}
      </div>

      {mode === "quick" ? (
        <div className="space-y-2">
          <Label>Category</Label>
          <CategorySelect value={category} onChange={setCategory} />
        </div>
      ) : (
        <div className="space-y-3">
          <Label>Items</Label>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
              <Input
                placeholder="Item"
                value={r.name}
                onChange={(e) =>
                  setRows((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
              />
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={r.amount}
                onChange={(e) =>
                  setRows((rs) => rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove item"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="col-span-3">
                <CategorySelect
                  value={r.categoryId}
                  onChange={(id) =>
                    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, categoryId: id } : x)))
                  }
                />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((rs) => [...rs, { name: "", amount: "", categoryId: null }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add item
          </Button>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="space-y-2">
              <Label htmlFor="tax">Tax</Label>
              <Input id="tax" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tip">Tip</Label>
              <Input id="tip" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="flex justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm font-medium">
            <span>Total</span>
            <span>{formatCents(itemizedTotal)}</span>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={save} disabled={ingest.isPending}>
        {ingest.isPending ? "Saving…" : "Save"}
      </Button>
    </section>
  );
}
