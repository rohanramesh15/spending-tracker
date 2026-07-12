import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategorySelect } from "@/components/CategorySelect";
import { ReconcileDialog } from "@/components/ReconcileDialog";
import { ScanLoader } from "@/components/ScanLoader";
import { useExtractReceipt, useIngest } from "@/api/hooks";
import type {
  IngestRequest,
  IngestResult,
  ReceiptDraft,
  ReconcileMatch,
  Resolution,
} from "@/api/types";
import { dollarsToCents, formatCents } from "@/lib/utils";
import { takePendingReceipt } from "@/lib/scanFile";

type Stage = "idle" | "extracting" | "confirm" | "error";

interface Row {
  name: string;
  amount: string;
  categoryId: string | null;
}

const centsToInput = (c: number) => (c / 100).toFixed(2);

/**
 * Scan flow (user-flow §3): photo → extraction wait → confirm screen (trust-but-verify)
 * → save. The photo is not retained; raw_extraction_json is the record. Uses the mock
 * extractor until a Gemini key is configured — the flow is identical either way.
 */
export default function ScanPage() {
  const navigate = useNavigate();
  const extract = useExtractReceipt();
  const ingest = useIngest();
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<ReconcileMatch | null>(null);

  function loadDraft(d: ReceiptDraft) {
    setDraft(d);
    setVendor(d.vendor);
    setDate(d.purchased_on);
    setRows(
      d.line_items.map((li) => ({
        name: li.normalized_name ?? li.raw_name,
        amount: centsToInput(li.price_cents),
        categoryId: li.category_id,
      })),
    );
    setTax(d.tax_cents ? centsToInput(d.tax_cents) : "");
    setTip(d.tip_cents ? centsToInput(d.tip_cents) : "");
    setStage("confirm");
  }

  async function runExtraction(file: File) {
    setStage("extracting");
    setError(null);
    try {
      const d = await extract.mutateAsync(file);
      loadDraft(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
      setStage("error");
    }
  }

  // On mount, pick up a photo captured by the FAB (if any).
  useEffect(() => {
    const f = takePendingReceipt();
    if (f) runExtraction(f);
  }, []);

  const itemsCents = rows.reduce((s, r) => s + (dollarsToCents(r.amount) ?? 0), 0);
  const taxCents = dollarsToCents(tax) ?? 0;
  const tipCents = dollarsToCents(tip) ?? 0;
  const total = itemsCents + taxCents + tipCents;
  const extractedTotal = draft?.total_cents ?? 0;
  const mismatch = draft ? Math.abs(total - extractedTotal) > 1 : false;

  function buildPayload(): IngestRequest | null {
    const items = rows.filter((r) => r.name.trim() && dollarsToCents(r.amount));
    if (!vendor.trim() || items.length === 0) {
      setError("Add a vendor and at least one item.");
      return null;
    }
    return {
      source: "receipt",
      vendor: vendor.trim(),
      purchased_on: date,
      subtotal_cents: itemsCents,
      tax_cents: taxCents,
      tip_cents: tipCents,
      total_cents: total,
      line_items: items.map((r) => ({
        raw_name: r.name.trim(),
        category_id: r.categoryId,
        price_cents: dollarsToCents(r.amount)!,
      })),
      raw_extraction_json: draft?.raw_extraction_json ?? null,
    };
  }

  function announce(result: IngestResult, resolution?: Resolution) {
    const msg =
      resolution === "merge"
        ? "Added to your existing entry"
        : resolution === "replace"
          ? "Replaced your existing entry"
          : result.status === "skipped"
            ? "Kept your existing entry"
            : `Saved — ${vendor}, ${formatCents(total)}`;
    toast.success(msg);
    navigate("/transactions");
  }

  async function submit(payload: IngestRequest, resolution?: Resolution) {
    try {
      const result = await ingest.mutateAsync(payload);
      if (result.status === "needs_decision" && result.match) {
        setPendingMatch(result.match);
        return;
      }
      setPendingMatch(null);
      announce(result, resolution);
    } catch (e) {
      setPendingMatch(null);
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function save() {
    setError(null);
    const payload = buildPayload();
    if (payload) await submit(payload);
  }

  async function resolve(resolution: Resolution) {
    const payload = buildPayload();
    if (!payload || !pendingMatch) return;
    await submit(
      {
        ...payload,
        resolution,
        matched_transaction_id: pendingMatch.matched_transaction_id,
      },
      resolution,
    );
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) runExtraction(f);
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Scan receipt</h1>
      </div>

      {/* Hidden capture input for desktop / re-pick */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onPick}
      />

      {stage === "idle" && (
        <div className="rounded-xl border bg-muted/30 p-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Take a photo of your receipt, or choose one.
          </p>
          <Button onClick={() => fileInput.current?.click()}>
            <Camera className="mr-2 h-4 w-4" /> Take / choose photo
          </Button>
        </div>
      )}

      {stage === "extracting" && <ScanLoader />}

      {stage === "error" && (
        <div className="rounded-xl border bg-muted/30 p-6 text-center">
          <p className="font-medium">Couldn't read this receipt</p>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              Retake photo
            </Button>
            <Button variant="ghost" onClick={() => navigate("/add")}>
              Enter manually
            </Button>
          </div>
        </div>
      )}

      {stage === "confirm" && (
        <div className="space-y-4">
          <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Scanned
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="vendor">Vendor</Label>
              <Input
                id="vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Items</Label>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
                <Input
                  value={r.name}
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  inputMode="decimal"
                  value={r.amount}
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                    )
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
                      setRows((rs) =>
                        rs.map((x, j) => (j === i ? { ...x, categoryId: id } : x)),
                      )
                    }
                  />
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((rs) => [...rs, { name: "", amount: "", categoryId: null }])
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add item
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tax">Tax</Label>
              <Input
                id="tax"
                inputMode="decimal"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tip">Tip</Label>
              <Input
                id="tip"
                inputMode="decimal"
                value={tip}
                onChange={(e) => setTip(e.target.value)}
              />
            </div>
          </div>

          {mismatch && (
            <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
              Numbers don't add up by {formatCents(Math.abs(total - extractedTotal))} —
              the receipt total was {formatCents(extractedTotal)}. Check the highlighted
              rows.
            </p>
          )}
          <div className="flex justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm font-medium">
            <span>Total</span>
            <span>{formatCents(total)}</span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={save} disabled={ingest.isPending}>
              {ingest.isPending ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <ReconcileDialog
        match={pendingMatch}
        incoming={{ vendor: vendor.trim(), total_cents: total }}
        busy={ingest.isPending}
        onResolve={resolve}
        onCancel={() => setPendingMatch(null)}
      />
    </section>
  );
}
