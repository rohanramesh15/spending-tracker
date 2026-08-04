import { useEffect, useRef, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Paragraph, Spinner, XStack, YStack } from "tamagui";

import { useExtractReceipt, useIngest } from "@shared/api/hooks";
import type {
  IngestRequest,
  IngestResult,
  ReceiptDraft,
  ReconcileMatch,
  Resolution,
} from "@shared/api/types";
import { centsToInput, dollarsToCents, formatCents } from "@shared/lib/money";
import { CategorySelect } from "@/components/CategorySelect";
import { ReconcileDialog } from "@/components/ReconcileDialog";
import { Button, Card, EmptyState, ErrorState, Field, PageHeader, PageTitle, Screen, TextField, useToast } from "@/components/ui";
import { itemizedTotalCents, type ItemRow } from "@/lib/manualEntry";
import { imageUploadPart } from "@/lib/uploads";

type Stage = "idle" | "extracting" | "confirm" | "error";

/**
 * Scan flow (user-flow §3): capture → extraction wait → confirm screen → save.
 *
 * Trust-but-verify (CLAUDE.md #7): the extracted draft is ALWAYS shown for confirmation and
 * editing before anything is saved. The photo is never retained by this app — it goes to the
 * backend, which deletes it on confirm; raw_extraction_json is the permanent record.
 *
 * Native-first: this is where the mobile app is genuinely better than web. Instead of a file
 * input with a capture hint, it opens the real camera, and the gallery is a first-class second
 * option for a receipt photographed earlier.
 *
 * Reached from Transactions → Add, which picks the source, so `?source=camera|library` opens the
 * corresponding picker immediately rather than making the user choose twice. The landing screen
 * below is the fallback for a bare /scan (e.g. the "scan a receipt" action on a transaction).
 */
export default function ScanScreen() {
  const router = useRouter();
  const { source: sourceParam } = useLocalSearchParams<{ source?: string }>();
  const autoSource = sourceParam === "camera" || sourceParam === "library" ? sourceParam : null;
  const toast = useToast();
  const extract = useExtractReceipt();
  const ingest = useIngest();

  const [stage, setStage] = useState<Stage>("idle");
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [tax, setTax] = useState("");
  const [tip, setTip] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<ReconcileMatch | null>(null);

  const total = itemizedTotalCents({ rows, tax, tip });

  function loadDraft(d: ReceiptDraft) {
    setDraft(d);
    setVendor(d.vendor ?? "");
    setDate(d.purchased_on ?? "");
    setRows(
      (d.line_items ?? []).map((li) => ({
        name: li.raw_name,
        amount: centsToInput(li.price_cents),
        categoryId: li.category_id ?? null,
      })),
    );
    setTax(centsToInput(d.tax_cents ?? 0));
    setTip(centsToInput(d.tip_cents ?? 0));
    setStage("confirm");
  }

  /**
   * Opens the picker once when arrived at with ?source=. The ref guard matters: without it a
   * re-render would relaunch the camera on top of itself.
   */
  const launched = useRef(false);
  useEffect(() => {
    if (!autoSource || launched.current) return;
    launched.current = true;
    void capture(autoSource, { returnOnCancel: true });
    // capture is a stable function declaration; re-running on its identity would relaunch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSource]);

  async function capture(source: "camera" | "library", opts?: { returnOnCancel?: boolean }) {
    setError(null);

    // Permissions are requested at the moment of use, not on mount — asking before the user has
    // expressed intent is the pattern people reflexively deny.
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError(
        source === "camera"
          ? "Camera access is needed to scan a receipt. You can enable it in Settings."
          : "Photo access is needed to pick a receipt. You can enable it in Settings.",
      );
      setStage("error");
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.8, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, exif: false });

    // Backing out of the camera is a normal action, not an error. When the picker was opened
    // automatically there is no landing screen worth returning to, so go back to where the
    // user pressed Add rather than stranding them on an empty scan screen.
    if (result.canceled || !result.assets?.[0]) {
      if (opts?.returnOnCancel) router.back();
      return;
    }

    const asset = result.assets[0];
    setStage("extracting");
    try {
      const extracted = await extract.mutateAsync(imageUploadPart(asset.uri, asset.mimeType));
      loadDraft(extracted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that receipt.");
      setStage("error");
    }
  }

  function buildPayload(): IngestRequest | string {
    if (!vendor.trim()) return "Add a vendor.";
    const items = rows.filter((r) => r.name.trim() && dollarsToCents(r.amount));
    if (items.length === 0) return "Add at least one item with a name and price.";

    const subtotal = items.reduce((s, r) => s + (dollarsToCents(r.amount) ?? 0), 0);
    const taxCents = dollarsToCents(tax) ?? 0;
    const tipCents = dollarsToCents(tip) ?? 0;

    return {
      source: "receipt",
      vendor: vendor.trim(),
      purchased_on: date,
      subtotal_cents: subtotal,
      tax_cents: taxCents,
      tip_cents: tipCents,
      total_cents: subtotal + taxCents + tipCents,
      // The extraction record travels with the save; the photo does not (CLAUDE.md #7).
      raw_extraction_json: draft?.raw_extraction_json,
      line_items: items.map((r) => ({
        raw_name: r.name.trim(),
        category_id: r.categoryId,
        price_cents: dollarsToCents(r.amount) as number,
      })),
    } as IngestRequest;
  }

  async function submit(payload: IngestRequest, resolution?: Resolution) {
    try {
      const result: IngestResult = await ingest.mutateAsync(payload);
      if (result.status === "needs_decision" && result.match) {
        setPendingMatch(result.match);
        return;
      }
      setPendingMatch(null);
      toast.success(
        resolution === "merge"
          ? "Added to your existing entry"
          : resolution === "replace"
            ? "Replaced your existing entry"
            : result.status === "skipped"
              ? "Kept your existing entry"
              : `Saved — ${payload.vendor}, ${formatCents(payload.total_cents)}`,
      );
      router.replace("/transactions");
    } catch (e) {
      setPendingMatch(null);
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function save() {
    const payload = buildPayload();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    setError(null);
    await submit(payload);
  }

  async function resolve(resolution: Resolution) {
    const payload = buildPayload();
    if (typeof payload === "string" || !pendingMatch) return;
    await submit(
      { ...payload, resolution, matched_transaction_id: pendingMatch.matched_transaction_id },
      resolution,
    );
  }

  function updateRow(index: number, patch: Partial<ItemRow>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  if (stage === "extracting") {
    return (
      <Screen testID="scan-screen" scrollable={false}>
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$4">
          <Spinner size="large" />
          <YStack alignItems="center" gap="$1">
            <Paragraph fontWeight="600">Reading your receipt…</Paragraph>
            <Paragraph size="$2" theme="alt2">
              This usually takes a few seconds.
            </Paragraph>
          </YStack>
        </YStack>
      </Screen>
    );
  }

  if (stage === "error") {
    return (
      <Screen testID="scan-screen">
        <ErrorState
          title="Couldn't scan that"
          message={error ?? undefined}
          onRetry={() => {
            setError(null);
            setStage("idle");
          }}
        />
      </Screen>
    );
  }

  if (stage === "idle") {
    return (
      <Screen testID="scan-screen">
        <PageHeader title="Scan a receipt" />
        <EmptyState
          icon="camera"
          title="Capture a receipt"
          message="We'll read the items and prices, then let you check them before saving."
        />
        <YStack gap="$3">
          <Button
            variant="primary"
            fullWidth
            icon={<Feather name="camera" size={16} color="white" />}
            testID="take-photo"
            onPress={() => void capture("camera")}
          >
            Take a photo
          </Button>
          <Button
            variant="secondary"
            fullWidth
            icon={<Feather name="image" size={16} />}
            testID="choose-photo"
            onPress={() => void capture("library")}
          >
            Choose from library
          </Button>
        </YStack>
      </Screen>
    );
  }

  // stage === "confirm" — trust-but-verify (CLAUDE.md #7)
  return (
    <Screen testID="scan-screen">
      <YStack gap="$1">
        <PageHeader title="Check the details" />
        <Paragraph size="$2" theme="alt2">
          Edit anything that looks wrong, then save.
        </Paragraph>
      </YStack>

      <Field label="Vendor" required>
        <TextField value={vendor} onChangeText={setVendor} testID="scan-vendor" />
      </Field>
      <Field label="Date">
        <TextField
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          testID="scan-date"
        />
      </Field>

      <Paragraph fontWeight="600">Items</Paragraph>
      {rows.map((r, i) => (
        <Card key={i} gap="$2">
          <XStack gap="$2" alignItems="center">
            <YStack flex={1}>
              <TextField
                value={r.name}
                onChangeText={(name) => updateRow(i, { name })}
                testID={`scan-item-name-${i}`}
              />
            </YStack>
            <YStack width={96}>
              <TextField
                value={r.amount}
                onChangeText={(amount) => updateRow(i, { amount })}
                inputMode="decimal"
                testID={`scan-item-amount-${i}`}
              />
            </YStack>
            <Button
              variant="ghost"
              size="sm"
              circular
              icon={<Feather name="trash-2" size={16} />}
              accessibilityLabel="Remove item"
              onPress={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            />
          </XStack>
          <CategorySelect
            value={r.categoryId}
            onChange={(categoryId) => updateRow(i, { categoryId })}
          />
        </Card>
      ))}

      <Button
        variant="ghost"
        size="sm"
        icon={<Feather name="plus" size={14} />}
        onPress={() => setRows((rs) => [...rs, { name: "", amount: "", categoryId: null }])}
      >
        Add item
      </Button>

      <XStack gap="$3">
        <YStack flex={1}>
          <Field label="Tax">
            <TextField value={tax} onChangeText={setTax} inputMode="decimal" testID="scan-tax" />
          </Field>
        </YStack>
        <YStack flex={1}>
          <Field label="Tip">
            <TextField value={tip} onChangeText={setTip} inputMode="decimal" testID="scan-tip" />
          </Field>
        </YStack>
      </XStack>

      <Card flat backgroundColor="$color3">
        <XStack justifyContent="space-between">
          <Paragraph fontWeight="600">Total</Paragraph>
          <Paragraph fontWeight="600" testID="scan-total">
            {formatCents(total)}
          </Paragraph>
        </XStack>
      </Card>

      {error ? (
        <Paragraph color="$red10" accessibilityRole="alert">
          {error}
        </Paragraph>
      ) : null}

      <Button
        variant="primary"
        fullWidth
        loading={ingest.isPending}
        onPress={() => void save()}
        testID="scan-save"
      >
        {ingest.isPending ? "Saving…" : "Save"}
      </Button>

      <ReconcileDialog
        match={pendingMatch}
        incoming={{ vendor: vendor.trim(), total_cents: total }}
        busy={ingest.isPending}
        onResolve={(r) => void resolve(r)}
        onCancel={() => setPendingMatch(null)}
      />
    </Screen>
  );
}
