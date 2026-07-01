/**
 * Home — the daily loop (user-flow.md §2): needs-review banner, this-month
 * summary + pie, uncategorized callout, recent transactions. Scaffold stub;
 * built out during the Phase 1 UI pass once the schema is applied.
 */
export default function HomePage() {
  return (
    <section>
      <h1 className="text-xl font-semibold">Home</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Nothing tracked yet — scan your first receipt.
      </p>
    </section>
  );
}
