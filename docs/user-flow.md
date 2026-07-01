# Spending Tracker — User Flow

Companion to the implementation plan. This describes every screen, every path between screens, and every state (waiting, error, empty) the user can encounter. Design decisions here are consistent with the plan's locked decisions: trust-but-verify confirm screens, never-auto-merge review queue, photos deleted on confirm, needs-review transactions excluded from charts.

Guiding UX principle: **the app is used in two postures.** Phone posture — standing in a parking lot with a receipt, 15 seconds of attention, one thumb. Desktop posture — sitting down weekly, reviewing and exploring. Every flow below is designed phone-first and expands on desktop.

---

## 0. Navigation shell

**Phone:** bottom tab bar with four tabs — **Home**, **Transactions**, **Insights**, **Settings** — plus a persistent, prominent **Scan** floating action button (FAB) center-bottom, above the tab bar. The FAB is the single most important control in the app; it is reachable by thumb from every tab.

**Desktop:** left sidebar with the same four sections; Scan becomes a primary button in the top bar (desktop scanning = drag-and-drop or file upload of a photo taken earlier).

**Global elements:**
- A **needs-review badge** (count) appears on the Home tab icon and as a banner at the top of Home whenever `reconciliation_reviews` has unresolved rows.
- Toasts for confirmations ("Saved", "3 transactions synced from Chase").
- All screens work logged-in only; an expired session bounces to Login preserving the intended destination.

---

## 1. First-run flow (once, ever)

1. **Landing → Login.** Email field → magic link (Supabase Auth). No password to manage.
2. **Click link → app opens → silent setup.** The category taxonomy is seeded automatically (no user action); a 3-card intro explains the loop: *Scan receipts → everything gets categorized → see where money goes.*
3. **Optional: connect a bank.** A single card offers "Connect Chase (or any bank)" → Plaid Link flow → success returns to Home. Skippable — the app is fully usable with scans + manual entry alone. A "Connect a bank" prompt persists quietly in Settings, not as a nag.
4. **Lands on Home in its empty state** (see §2, Empty state).

Total: under 2 minutes, one decision (connect bank or not).

---

## 2. Home — the daily loop

**Purpose:** answer "what's my spending state?" in one glance, and put Scan one tap away.

**Layout (top to bottom, phone):**
1. **Needs-review banner** (only when pending): "2 transactions need review →" — amber, taps into the Review flow (§6).
2. **This-month summary:** total spent this month + the pie chart (current month by default), tax and tip as their own slices. Tapping any slice → Transactions filtered to that category + month.
3. **Uncategorized wedge callout** (only when Plaid-only transactions exist): "· $84 uncategorized — scan receipts to itemize" — taps to a filtered list of unitemized transactions.
4. **Recent transactions:** last 5–7 as compact cards (vendor, date, total, source icon). Tap → Transaction detail (§7). "See all →" → Transactions tab.
5. **Scan FAB** floating above it all.

**Empty state (no data yet):** the pie is replaced by a friendly card: "Nothing tracked yet — scan your first receipt" with an arrow to the FAB, plus a secondary "Add manually" link. No dead-looking zero-chart.

**Daily loop in practice:** open app → glance at total + pie → close. Two seconds. Or: open app → tap FAB → scan flow.

---

## 3. Scan flow (the make-or-break flow)

**Goal: pocket → scanned → confirmed → pocket in under 60 seconds, most of which is the model working, not the user.**

1. **Tap Scan FAB.** Immediately opens the native camera via `<input capture="environment">` — no intermediate screen, no mode picker. (Multi-page receipts: after the first photo, the upload screen offers "+ Add another page" before extracting.)
2. **Photo taken → Upload screen.** Thumbnail of the shot + progress bar. Two actions: **Retake** (photo unusable) and **Use photo**. Blur/darkness is the user's call at this stage — the thumbnail is the check.
3. **Extraction wait (5–20 s).** This wait must feel alive, not stuck:
   - Staged status text that actually tracks the pipeline: "Uploading…" → "Reading your receipt…" → "Categorizing items…"
   - A skeleton of the confirm screen builds underneath (ghost rows), so the wait visually becomes the next screen.
   - The screen warns softly: "Keep this open — almost done." (Serverless request/response; no background completion in v1.)
   - **Failure path:** extraction fails or times out → "Couldn't read this receipt" with three options: **Retry**, **Retake photo**, **Enter manually** (pre-navigates to manual entry with the photo discarded). Never a dead end.
4. **Confirm screen — the heart of trust-but-verify.**
   - Header: vendor, date (both tappable-to-edit), source badge "Scanned".
   - Line items as editable rows: name (normalized, with raw name as subtext), price, qty, category chip. Tap a chip → category picker (recent + full taxonomy). Any category change is remembered (`category_overrides`).
   - Row actions: swipe/× to delete a misread row; "+ Add item" for a missed one.
   - Footer: subtotal · tax · tip · **total**, each editable. A live **reconciliation check**: if items + tax + tip ≠ total (integer cents), an amber note — "Numbers don't add up by $0.37 — check the highlighted rows" — with the likely-misread rows flagged (lowest-confidence extractions).
   - Primary button: **Save**. Secondary: **Discard**.
5. **On Save:**
   - If an **attended match** is found (you're re-scanning something, or a Plaid transaction already covers this purchase): the reconciliation dialog appears *now* — side-by-side mini-cards, **Merge** highlighted as default, Skip / Replace / Keep both beneath. One tap resolves it.
   - Otherwise: saved directly. **The photo is deleted**, a toast confirms "Saved — Kroger, $54.12", and you return to Home with the new transaction at the top of Recent.

Tap count, happy path: FAB → shutter → Use photo → (wait) → Save. **Four taps.**

---

## 4. Manual entry flow

**Goal: fast enough that a $4 coffee actually gets entered.** Two modes on one screen:

1. Entry points: "Add manually" from Home's overflow / Transactions' + button / the scan-failure fallback.
2. **Quick add (default):** four fields — vendor, total, date (defaults today), one category for the whole purchase. Save. Ten seconds. Stored as a single-line-item transaction so the chart rule treats it as itemized.
3. **Itemized (toggle):** expands to the same editable-rows UI as the scan confirm screen (shared component), with tax/tip fields. For when you want detail without a photo.
4. Same attended-reconciliation check on save as the scan flow.

---

## 5. Transactions tab

**Purpose:** the browsable ledger.

- Infinite list grouped by day; each row: vendor, total, category summary (or "Uncategorized" pill), source icon (📷 scan / ✎ manual / 🏦 bank).
- **Filter bar:** date range (same picker as Insights), category, source, and a "Needs review" toggle.
- Search by vendor/item name.
- Tap a row → **Transaction detail (§7)**.
- Plaid-only (unitemized) rows show a subtle prompt: "Have the receipt? Scan to itemize →" which launches the scan flow *pre-linked* to that transaction (its result merges automatically on confirm — this is attended, so no queue).

---

## 6. Review flow (unattended reconciliation)

**Purpose:** drain the needs-review queue in seconds, not minutes.

1. Entry: Home banner tap, or Transactions' "Needs review" filter, or the tab-icon badge.
2. **Queue screen:** one card per pending match, newest first. Each card shows both transactions side-by-side (or stacked on phone): the incoming bank transaction vs. the matched existing entry — vendor, date, total, and the match reason ("same vendor, same total, 1 day apart").
3. Four buttons per card, **Merge** visually primary: Merge · Skip (not the same purchase) · Replace · Keep both.
4. One tap resolves a card; the next slides up. Resolved transactions immediately enter the charts (they were excluded while pending).
5. Empty state: "All caught up ✓".

Design note: cards are resolvable *without opening anything* — all deciding information is on the card. Opening a card (tap) shows full line-item detail for the rare hard call.

---

## 7. Transaction detail

- Full header (vendor, date, source, account if bank-synced) + complete line-item table with categories.
- Edit anything inline (same shared row component); edits to categories feed `category_overrides`.
- Actions: delete transaction; "Scan receipt for this" (if unitemized); view raw extraction (debug curiosity, collapsed by default).
- No photo is shown — photos are deleted on confirm by design; the data *is* the record.

---

## 8. Insights tab (chart + recurring + finder)

Three stacked sections (phone) / three panels (desktop):

**8a. Spending chart.**
- Date-range picker: presets (This month · Last month · Last 90 days · Custom range · **Single day**) — single day is a first-class preset, not a hidden trick.
- Pie by category (tax, tip, Uncategorized as real slices). Tap slice → filtered Transactions.
- **Empty range:** "No spending recorded between Mar 3–Mar 9" + "Add a purchase" shortcut. Future dates gently corrected.

**8b. Recurring items.**
- Auto-detected list: canonical name, times bought, average unit price, sparkline of price over time.
- Each row's action: **"Find it cheaper →"** → Finder (8c) pre-loaded with that item's comparable spec.
- Manual search field pinned on top: "Search any item…" → same Finder, user-typed spec.

**8c. Cheaper-store finder.**
1. Item header: the comparable spec in words — "2% milk, ~1 gal" — with a **tightness control** (Strict / Medium / Loose) as a segmented toggle, defaulting conservative. Changing it re-filters instantly (cache re-query, no new fetch).
2. **Map with radius:** circle centered on your location, radius slider (1–25 mi). Kroger-banner stores pinned with prices; other stores pinned gray ("no price data").
3. **Ranked results list:** store, product title, size, **price-per-unit** (the sort key), total price, distance, "as of [time]" stamp. Top result highlighted with the comparison: "$2.49/gal vs. your usual $5.99/gal".
4. **First-visit state per item:** if no cached quotes exist yet, "Checking prices near you…" — the request enqueues a background job; the screen polls and fills in as quotes land (usually seconds). Stale cache (>24 h) shows results immediately with a "Refresh prices" affordance.
5. **No-Kroger-in-radius state (honest):** "No stores with live prices within 5 mi — widen the radius, or these nearby stores may carry it (no price data)." Never fabricate a comparison.

---

## 9. Settings

- **Connected accounts:** list from `linked_accounts` ("Chase ····4821 — syncing"), + "Connect another", re-auth prompts on Plaid errors. Labeled "Connected accounts," never "Plaid".
- **Categories:** view taxonomy; rename allowed (IDs stable); merge/split gated behind a warning (re-maps history).
- **Import:** Apple Card CSV upload → routes through `/api/ingest` → items land like any source (may create review cards).
- **Data:** export everything as CSV; danger-zone delete-all.
- **About/status:** last Plaid sync time, extraction provider indicator ("Gemini — free tier" with the swap-later note).

---

## 10. Cross-cutting states

- **Loading:** skeletons everywhere, never blank screens; TanStack Query keeps last-known data visible during refetch.
- **Offline / request failed:** non-destructive retry toasts; scan flow's failure path (§3.3) is the template — always offer a way forward.
- **Cold start (1–3 s first request):** absorbed by skeletons; no special messaging.
- **Session expiry:** silent refresh; if truly expired, Login with return-to-destination.
- **Sync notices:** when Plaid webhooks delivered new transactions since last visit, a passive toast on open: "3 new transactions from Chase" (tap → Transactions filtered to them; any matches are already in the review queue).

---

## 11. Flow map (text form)

```
Login (once)
  └─ Home ──────────────┬─ [FAB] Scan → Upload → Wait → Confirm → (match? attended dialog) → Saved → Home
      │                 ├─ Review banner → Review queue → resolve cards → Home
      │                 ├─ Pie slice → Transactions (filtered)
      │                 └─ Recent row → Transaction detail
      ├─ Transactions ──┬─ row → Detail ─ (unitemized? → Scan pre-linked)
      │                 └─ + → Manual entry (quick | itemized) → Saved
      ├─ Insights ──────┬─ Chart (range | single day | empty state)
      │                 ├─ Recurring list → Finder (item)
      │                 └─ Search any item → Finder (typed)
      └─ Settings ──────── accounts · categories · CSV import · export
```

---

## 12. Decisions made here worth confirming

1. **Home = summary + recent + FAB** (not a chart-only dashboard, not a list-only ledger).
2. **Scan FAB opens the camera directly** — zero intermediate screens.
3. **Quick-add is the manual-entry default**; itemized is the toggle.
4. **Review cards are resolvable without opening them.**
5. **Single-day is a preset**, not a custom-range trick.
6. **Insights houses recurring + finder** rather than a fifth tab.
7. **No photo viewing anywhere** — consistent with delete-on-confirm.
