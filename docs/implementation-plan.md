# Spending Tracker — Implementation Plan

A single-user web app that captures purchases (by scanning receipts, manual entry, or bank sync), categorizes and charts spending, and suggests cheaper stores for items you buy repeatedly. Built web-first, with the architecture deliberately shaped so Apple Card auto-sync can be added later without touching the web app.

---

## 1. Guiding principles

These five decisions shape everything below:

1. **Web-first, clean front/back split, serverless backend.** A **React + Vite** static frontend and a **FastAPI (Python) backend on AWS Lambda**, no native app now. Chosen for "cheapest forever + best ops semantics": the backend runs entirely on AWS **always-free** allowances (Lambda, SQS, EventBridge), so webhooks always answer and crons always fire — no sleeping free tiers, no monthly hosting bill.
2. **Source-agnostic transactions.** Every purchase flows through one ingestion endpoint and carries a `source` tag. Manual, receipt, and Plaid populate it today; Apple Card slots in later through the *same Plaid pipeline* (delivered via a small iOS agent) with zero schema change.
3. **Trust-but-verify extraction.** OCR/AI is never assumed correct — every scanned or auto-imported transaction hits a confirm screen before it's saved.
4. **Honest comparisons.** The cheaper-store feature compares *categories of item* (e.g. "a ~gallon of 2% milk"), normalizes to price-per-unit, and always shows the user exactly what substitution it's proposing.
5. **Swappable, deferrable externals.** The extraction LLM sits behind one isolated function so the provider can change in an afternoon (currently **Gemini free tier**, to be swapped for a paid tier later). Online price comparison is **deferred** for now — the cheaper-store finder ships physical/Kroger-only, and the online leg can be added later without reshaping anything.

---

## 2. Feature summary

- **Receipt scanning** — photograph a receipt; extract vendor, date, each item + price, tax, and tip. Works for any receipt type, not just groceries.
- **Manual entry** — add a purchase with no photo.
- **Auto-categorization** — every line item gets a category. **Tax is its own category; tip is its own category.**
- **Per-purchase table** — items, prices, and categories per transaction (responsive: table on desktop, cards on phone).
- **Spending pie chart** — filter by a date range or a single day; graceful empty state when there's no spending in the range.
- **Duplicate handling / reconciliation** — when a new entry matches an existing one, offer merge / skip / replace / keep-both; matches arriving unattended (webhooks) go to a needs-review queue, never auto-merged.
- **Bank sync** — Chase and most banks via Plaid; Apple Card deferred (see §11).
- **Recurring-item tracking** — detect items bought repeatedly (keyed on the normalized item name, so brand changes don't hide the pattern).
- **Cheaper-store finder** — for a recurring item (or a manual search), find cheaper equivalents at **physical stores** within a chosen radius, with a user-controlled substitution tightness. (Online price comparison deferred — see §5 principle and §6.9.)

---

## 3. Key architectural decisions (options considered → choice)

| Decision | Options considered | Choice & why |
|---|---|---|
| App platform | Pure PWA / native iOS / Expo universal | **Pure web.** Apple Card is deferred, so the only reason to go native/Expo is gone. Web reaches every device; iOS sync agent can be bolted on later in isolation. |
| Web stack | Next.js (unified) / **FastAPI + React·Vite (split)** | **FastAPI backend + React/Vite frontend.** The backend is genuinely job-heavy (LLM extraction, scheduled price/sync jobs, reconciliation) — Python fits that better, and a clean front/back separation is independently deployable. Tradeoff: two deploys, CORS, and generating a typed TS client from FastAPI's OpenAPI schema (one-time setup). |
| Backend hosting & jobs | Always-on PaaS (Railway/Render ~$5/mo) + ARQ/Redis / **AWS serverless (Lambda + SQS + EventBridge)** | **AWS serverless.** Chosen for cheapest-forever + best ops semantics: Lambda/SQS/EventBridge always-free allowances are permanent and vastly exceed single-user volume, webhooks always answer (no sleeping tier), and scheduled jobs fire reliably. Cost: $0/mo indefinitely. Tradeoff: heavier setup week (SAM/CDK, IAM, Lambda packaging) vs. a git-push PaaS. Sign up on the **Paid Plan** (credits still apply, no 6-month account closure), set a $1 budget alert day one, never create a NAT Gateway. |
| Receipt extraction | Dedicated OCR (Textract/Veryfi) / vision LLM | **Vision LLM — Gemini 2.5 Flash (free tier) for now.** One call does OCR + field extraction + categorization + name normalization + edge cases. At single-user volume all providers cost pennies, so chosen on OCR quality + a strong free tier. Behind one swappable function; move to a **paid tier** (Gemini or another provider) before this handles anything beyond a personal prototype. Dedicated OCR kept as optional low-confidence fallback. |
| Database | Firestore / Supabase Postgres | **Supabase Postgres.** Relational fits transactions→line-items; aggregate queries power charts and recurring detection. Also gives auth + storage. |
| Charts | Victory / Recharts | **Recharts.** Cleaner for a React web-only app (Victory was only chosen earlier for cross-platform). |
| Item comparison | Exact-SKU (UPC) match / equivalence-class match | **Equivalence-class.** User wants "similar item cheaper," not "same product." Store brands become valid contenders; UPC resolution demoted to optional. |
| Price fetching | Synchronous on page load / background jobs + cache | **Background jobs + cache.** Fan-out (item × stores × visits) would blow rate limits and cost. Fetch on a schedule, read from cache. |
| Apple Card sync (later) | Raw FinanceKit + custom code / Plaid-over-FinanceKit | **Plaid-over-FinanceKit.** Plaid now offers an Apple Card integration built on FinanceKit; using Plaid's SDK in the iOS agent unifies Apple Card with Chase (same pipeline, categories, reconciliation) and avoids hand-writing FinanceKit code. Still native-iOS-only. |

---

## 4. Tech stack

**Languages:** TypeScript (strict) on the frontend, Python 3.12+ on the backend.

**Frontend (React + Vite SPA)**
- React + Vite — fast SPA build; static output deployable to any CDN host
- React Router — client-side routing
- Tailwind CSS — responsive phone↔desktop layout
- shadcn/ui (Radix) — Dialog (reconciliation prompt), Table, Calendar, Select
- Recharts — pie chart
- TanStack Query — server-state cache, mutations, optimistic updates
- React Hook Form + Zod — forms + client-side validation
- Typed API client generated from the backend's OpenAPI schema (`openapi-typescript` / `orval`) — keeps frontend types in sync with FastAPI
- date-fns + react-day-picker — date range / single-day picker
- `@vis.gl/react-google-maps` — radius circle on a map

**Backend (FastAPI on AWS Lambda)**
- FastAPI + **Mangum** (ASGI→Lambda adapter) behind a **Lambda Function URL** (committed — not API Gateway: Gemini extraction can take 5–20s and API Gateway's ~29s cap leaves no retry headroom; the Function URL has no such ceiling and is also free) — same FastAPI code, serverless execution; auto-generated OpenAPI schema drives the frontend's typed client
- Pydantic — request/response models **and** validation of the LLM's JSON output (the Python analog of Zod)
- Pillow (+ `pillow-heif`) — image normalization for receipt photos: HEIC→JPEG, EXIF auto-rotate, downscale, strip GPS metadata. *Packaging note: `pillow-heif` ships native libs — build the deployment package/layer in a Lambda-matching container (SAM build image or Docker `public.ecr.aws/lambda/python`) or deploy the function as a container image.*
- Endpoints: `POST /api/ingest` (source-agnostic), Plaid webhook, receipt-extraction endpoint — always-on by nature (no sleeping tier), so webhooks are never missed
- **Background jobs: SQS + a worker Lambda** (replaces ARQ/Redis — no Redis anywhere). The API Lambda enqueues; the worker Lambda consumes. Price refresh, Plaid re-sync, recurring recompute. Chunk long fan-outs into one-message-per-store jobs to stay far under Lambda's 15-min cap; use an SQS DLQ for poison messages.
- **Scheduling: EventBridge Scheduler** — daily price refresh, periodic Plaid re-sync; fires the worker (or enqueues to SQS) on cron expressions. Reliable, precise, free at this volume.
- **Auth + real RLS (decided):** Supabase JWT verified in a FastAPI dependency, then **the same JWT's claims are set on the DB session per request** (`SET LOCAL role = authenticated; SET LOCAL request.jwt.claims = ...` inside the request's transaction) so Postgres Row-Level Security actually applies to Lambda queries. Queries still include explicit `WHERE user_id` filters for correctness — RLS is the safety net, not the filter. Debugging note: mis-set claims manifest as mysteriously *empty* results, not errors.
- **Secrets:** SSM Parameter Store (SecureString — free tier) holds Gemini/Plaid/Kroger/Places keys and the DB URL; referenced from the SAM template, loaded at Lambda init. Nothing in source control or plaintext env vars.
- **Cold starts:** with FastAPI + SQLAlchemy + Pillow/pillow-heif in the bundle, expect ~1–3s on the first request after idle — normal, not a bug. If it ever annoys: trim top-level imports, or add a free EventBridge warm-ping.
- **DB connections from Lambda:** connect through **Supabase's transaction pooler (Supavisor, port 6543)**, not direct Postgres — many short-lived Lambda invocations exhaust direct connections. Disable SQLAlchemy client-side pooling (`NullPool`) and let the pooler do the work.
- IaC/deploy: **AWS SAM** (locked) — one template for the API Lambda, worker Lambda, SQS queue + DLQ, EventBridge schedules, and SSM parameter references; `sam deploy` from CI or local

**Data**
- Supabase Postgres — primary DB
- SQLModel (SQLAlchemy 2.0 + Pydantic) + Alembic — typed models, migrations, aggregate queries; **`NullPool` + Supavisor, always**
- **Money is integer cents everywhere** (`*_cents BIGINT` columns, Python `Decimal`/`int`, never `float`); reconciliation's "within a cent" is integer math: `abs(a - b) <= 1`
- Supabase Auth — **Google OAuth (primary) + email magic link (fallback)**, both via Supabase Auth's providers so the result is always a Supabase JWT and the backend's JWT verification + RLS are unchanged (financial data must be auth-gated). Google sign-in requires a Google Cloud OAuth client whose secret is set on the Supabase Google provider; the OAuth redirect URI is Supabase's `/auth/v1/callback`.
- Supabase Storage — receipt images, **transient only**: held between upload and confirm, deleted after confirm (see §6.1)
- **Row-Level Security enforced for real**: policies scoped to `user_id` on every table, made effective from Lambda by setting JWT claims per request (see Backend above) — not the bypassed-by-service-role illusion

**External services** (all called server-side from Python)
- Gemini API (**free tier for now**, `google-genai` Python SDK) — vision extraction + normalization, behind one swappable `extract_receipt()` function. Use a **paid tier** before non-prototype/sensitive use (free-tier data may be used to improve Google's products).
- `plaid-python` — Chase + bank sync
- Google Places API (via `httpx`) — nearby stores within radius
- Kroger Products + Location API (via `httpx`) — official per-store grocery pricing (the price source for the finder)
- (Optional) UPC lookup (UPCitemdb / Go-UPC) — only if locking onto a specific product
- (Optional) Textract AnalyzeExpense — low-confidence OCR fallback
- *(Deferred — online price comparison)* SerpApi (or a cheaper pay-as-you-go alternative) — not integrated now; add when the online leg of the finder is built.

**Camera:** `<input type="file" accept="image/*" capture="environment">` — opens the camera on mobile Safari/Android, no library.

**Dev/deploy (defaults locked):** frontend — pnpm · ESLint + Prettier · Vitest + React Testing Library · Playwright (E2E) · static build hosted free on **Cloudflare Pages**. Backend — **uv** · Ruff + Black · pytest · **AWS SAM** deploys the API Lambda + worker Lambda + SQS + EventBridge schedules; local dev runs plain `uvicorn` (Mangum only wraps in Lambda). AWS account on the **Paid Plan** with a $1 budget alert. PWA manifest for home-screen install. CORS configured between the two origins.

---

## 5. Data model (Postgres)

**Global rules:** all money columns are **integer cents** (`_cents`); all tables carry `user_id` with an RLS policy; `purchased_on` is a **local calendar date** (`DATE`) plus optional `purchased_time` — never a fake-precision UTC timestamp, because receipts give local wall-clock and Plaid gives dates, and day-boundary chart filters must agree with the receipt in your hand.

**`linked_accounts`** — connected sources. `(id, user_id, institution, account_type, source [plaid|manual], external_account_id, is_apple_card, sync_mode [server|device], status)`. UI labels these "Connected accounts," never "Plaid." Apple Card is a Plaid account with `is_apple_card = true` and `sync_mode = device` (it needs the iOS agent to relay it); Chase and other banks are `sync_mode = server`.

**`transactions`** — `(id, user_id, linked_account_id?, vendor, purchased_on, purchased_time?, source [receipt|manual|plaid], external_id, subtotal_cents, tax_cents, tip_cents, total_cents, currency, receipt_image_path?, raw_extraction_json, review_status [confirmed|needs_review], created_at)`. Unique constraint on `(user_id, source, external_id)` for per-user idempotency. *(`linked_account_id` — nullable FK to `linked_accounts`, SET NULL on delete — was added in Phase 1 review, ahead of §5's original list, so a Plaid transaction can be attributed to its account for the Settings view and per-account filtering in Phase 3.)* `review_status = needs_review` marks webhook-ingested transactions whose reconciliation is parked pending your decision (see §6.3). `receipt_image_path` is transient — set at upload, **nulled after confirm when the image is deleted**; `raw_extraction_json` is the permanent record of what was extracted. Apple Card arrives later as `source: "plaid"` (it rides Plaid's pipeline) and is distinguished via its `linked_accounts` row — so no new source value or schema change is needed.

**`reconciliation_reviews`** — the pending-review queue. `(id, user_id, incoming_transaction_id, matched_transaction_id, match_score, created_at, resolved_at?, resolution [merge|skip|replace|keep_both]?)`. Populated whenever an unattended ingest (webhook, scheduled re-sync) finds a semantic match; drained by the "needs review" UI. **Nothing is ever auto-merged** (decided).

**`line_items`** — `(id, user_id, transaction_id, position, raw_name, normalized_name, category_id, price_cents, quantity, unit_size, unit)`. `price_cents` is the **line-extended total** (quantity × unit price); `position` preserves receipt order. `user_id` is denormalized from the parent (see multi-tenant note below).

> **Multi-tenant hardening (Phase 1 review decision).** The §5 global rule ("all tables carry `user_id` with an RLS policy") is taken literally: `user_id` is present on the child tables too (`line_items`, `comparable_specs`, `price_quotes`), even where the per-table lists above omit it. Child→parent foreign keys are **composite and owner-scoped** — `(user_id, parent_id) → parent(user_id, id)` — so a user can never attach a child to another user's row (plain FK checks bypass RLS). Nullable label refs (`category_id`, `linked_account_id`) stay simple FKs. Idempotency is per-user. RLS policies key on the request JWT's `sub` claim, wrapped in `(select …)` for once-per-query evaluation.

**`categories`** — `(id, user_id, name, is_system)`. Includes first-class `Tax` and `Tip`. **This is the fixed taxonomy, seeded in Phase 1 and embedded in the extraction prompt** — the LLM must pick from it (fallback `Other`), never invent categories. Renames are safe (IDs stable); merges/splits require re-mapping historical rows, so lock the list before ingesting data.

**`category_overrides`** — remembers user corrections to bias future categorization.

**`recurring_items`** — `(id, user_id, canonical_name, category_id, occurrences, first_seen, last_seen, avg_unit_price_cents)`. **Detection keys on `canonical_name`** (the normalized item, e.g. "milk, 2%") — that's what the comparable spec needs — with `category_id` alongside for filtering/UI. Grouping by category alone would fire on "bought Dairy 3 times" and drown in noise. Requires stable normalization: the extraction prompt pins naming conventions (lowercase, generic noun first) so "GV MILK 2%" and "KRO 2% MILK GAL" collapse to the same canonical string.

**`comparable_specs`** — the equivalence class for a recurring item: `(id, recurring_item_id, category, attributes_json, size_value, size_unit, substitution_tightness)`.

**`price_quotes`** — cache. `(id, comparable_spec_id, store_name, store_type [physical|online], location_id, product_title, price_cents, unit_price_cents, unit, distance_mi, source_api, fetched_at)`. UI always reads from here. For now only `physical` quotes (Kroger) are written; the `online` type is reserved for when the online leg is added.

---

## 6. How each subsystem works

### 6.1 Receipt scanning & extraction
Photo → uploaded to Supabase Storage → **image normalization on the backend** (Pillow: convert HEIC/HEIF → JPEG — iPhones capture HEIC by default; auto-rotate via EXIF orientation; downscale to ≤ ~2000px longest edge; strip EXIF GPS metadata before storage) → backend calls the extraction LLM (**Gemini 2.5 Flash, free tier for now**) with a prompt that returns structured JSON: vendor, date, line items (name, price, qty), tax, tip, plus a **category and normalized name per item**. The prompt embeds the **fixed Phase 1 taxonomy** and instructs the model to choose only from that list (fall back to `Other`, never invent categories); a Pydantic model validates the JSON, including that each category is a valid taxonomy member. Edge cases (no tax, restaurant tip, multi-page, deposits, BOGO) are handled by prompt instructions, not brittle rules. **Always** land on a confirm/edit screen before save. **On confirm, the photo is deleted from Storage** (decided): the extracted data + `raw_extraction_json` are the permanent record; the image only lives between upload and confirm. This keeps Storage near-empty forever and means receipt photos (merchant, location, card-last-four) aren't retained. The call lives behind one `extract_receipt()` function so the provider/tier is a one-file swap. Optional: if the model flags low confidence, re-run through Textract AnalyzeExpense and reconcile. *Note: the free tier may use content to improve Google's products — move to a paid tier before this is more than a personal prototype.*

> **Gemini path wired (Phase 2).** `extract_receipt()` calls **`gemini-2.5-flash`** via `google-genai` when a key is set, and falls back to a deterministic mock when it isn't (so the whole scan/confirm/ingest flow is testable keyless). Two implementation notes: (1) Gemini's controlled generation (`response_schema`) only reliably supports primitive JSON types, so the SDK is handed a **clean wire schema** of primitives (`quantity` as NUMBER, `purchased_on` as a plain string, money as ints) and the result is converted into the public `ExtractedReceipt` (Decimal/date + the category-whitelist validator) *inside* `extract.py` — no Gemini/SDK type leaks past that boundary, and a unit test guards the schema from regressing back to Decimal/date. (2) Extraction failures surface as a **502** so the SPA shows the §3 "couldn't read this receipt" state rather than a raw 500. **Key delivery:** local dev reads `GEMINI_API_KEY` from `.env`; prod reads it from SSM SecureString **`/<prefix>/gemini-api-key`** (the SAM template already grants the path read + `kms:Decrypt` and `secrets.py` maps it in — no infra change needed, just create the parameter). **Tier decision is the human's:** the free tier may train on your receipt images; move to a billed key before real financial data — the code path is identical either way.

### 6.2 Manual entry
Same confirm screen with blank fields; routes through the same ingest path (§6.3).

### 6.3 Ingestion seam + reconciliation
Every source calls one idempotent FastAPI handler: `POST /api/ingest`. It normalizes, dedupes on `(source, external_id)`, and saves. **Reconciliation** matches a new transaction against existing ones on *semantics only* — normalized vendor + date within ±1–2 days + total within a cent (**integer math on cents**), or strong item overlap — never on source.

Reconciliation has two modes, split by whether you're present:
- **Attended** (you're scanning a receipt or entering manually): the match dialog appears immediately — **Merge** (default: attach receipt line items onto the card transaction; card = authoritative total/date, receipt = itemization), or **Skip / Replace / Keep both** for uncertain matches.
- **Unattended** (Plaid webhook at 3 a.m., scheduled re-sync): **nothing is ever auto-merged** (decided). The incoming transaction is saved with `review_status = needs_review` and a row is written to `reconciliation_reviews`; a "needs review" badge/queue in the UI surfaces it next time you open the app, where you resolve it with the same four choices. Until resolved, both transactions exist but the pending one is excluded from charts to avoid double-counting.

This is the exact door the future Apple Card agent will POST to.

> **Attended reconciliation shipped (Phase 2).** `POST /api/ingest` now runs the matcher before saving an attended source (`receipt`/`manual`). The two-call flow keeps the single ingest door: the first POST that finds a semantic duplicate writes nothing and returns `{status: "needs_decision", match}`; the client shows the merge/skip/replace/keep-both dialog and re-POSTs the *same* payload with `resolution` + `matched_transaction_id`. **Merge** overlays the incoming receipt's line items + tax/tip + `raw_extraction_json` onto the existing row (existing stays authoritative for total/date/vendor/source — exactly the card+receipt case); **replace** deletes the existing row and inserts the incoming; **skip** discards the incoming; **keep-both** inserts alongside. Matcher lives in `app/services/reconcile.py`: same normalized vendor (case/punctuation-insensitive, store numbers dropped) + date within ±2 days + total within a cent; conservative by design (`§10`) so near-misses don't nag. **Scope note:** the *item-overlap* signal is deferred to Phase 3 — it only matters once Plaid brings in unitemized card transactions to overlap against; vendor+date+total cleanly covers every attended duplicate that exists today (re-scanning a receipt, or scanning something already entered by hand). The **unattended** needs-review path (webhooks → `reconciliation_reviews`) still lands in Phase 3.

### 6.4 Categorization
The LLM assigns each line item a category from a fixed taxonomy. **Tax and tip are their own categories**, stored at transaction level and surfaced as pie slices so the chart reconciles to the exact amount paid. User overrides are saved to `category_overrides` and bias future categorization.

### 6.5 Per-purchase table
Responsive: desktop = real table (item · price · category, with vendor/date/subtotal/tax/tip/total header); phone = stacked cards.

### 6.6 Pie chart + date filtering
Date-range picker with single-day mode (start = end), filtering on `purchased_on` (local dates). **Aggregation rule (per transaction, to avoid both under-counting and double-counting):**
- **Itemized** (has line items — receipts, merged transactions): chart its line items by category + its tax and tip as their own slices; ignore its total (redundant).
- **Unitemized** (Plaid-only, no receipt yet): chart its **total** as one slice under an "Uncategorized" bucket (or a coarse category from Plaid's PFC hint). The size of this slice doubles as a visible "receipts not yet scanned" to-do.
- Transactions with `review_status = needs_review` are **excluded** until resolved.

**Empty range** → friendly "No spending recorded between [dates]" state with an add shortcut. Guard single-day and future-date cases.

### 6.7 Bank sync
**Chase + banks:** Plaid. Backend creates a link token; user authenticates; access token stored server-side (SSM); `/transactions/sync` + webhooks feed `POST /api/ingest`. **The webhook endpoint verifies Plaid's JWT signature** (`Plaid-Verification` header against Plaid's verification key) before processing anything — it's a public URL feeding the ingest path. Plaid's PFC v2 category hints help reconcile against your taxonomy and label the "Uncategorized" chart bucket. **Development discipline:** iterate exclusively in Plaid Sandbox — the trial plan's 10-Item cap is *lifetime* and counts removed Items, so link real accounts exactly once, at the end.
**Apple Card:** deferred, but rides this *same Plaid pipeline* later via an iOS agent — so it lands in `/api/ingest` with `source: "plaid"` and gets the same categorization and reconciliation as Chase. See §11.

> **Bank sync shipped (Phase 3, Sandbox).** Plaid behind one seam (`services/plaid_client.py`; no SDK types leak). Endpoints: `POST /api/plaid/link-token`, `/exchange` (stores the Item + runs an initial sync), `/sync` (incremental cursor sync), `GET /api/plaid/accounts`, and the public `POST /api/plaid/webhook`. The webhook **verifies the `Plaid-Verification` ES256 JWS over the raw body** (per-`kid` key, ≤5-min freshness, `request_body_sha256` match) before doing anything, then resolves item→owner via an admin lookup and runs the sync under that user's RLS session. Every bank transaction goes through the one ingest door, so a match parks in the needs-review queue (never auto-merged). **Scope (Sandbox MVP):** posted purchases only — pending, credits/refunds (non-positive), and money movements (income/transfers/loan/card payments, via Plaid's PFC hint) are skipped; `removed` deletes; unitemized so they chart under "Uncategorized" until a receipt merges on. Proven end-to-end against live Sandbox (link→exchange→sync→ingest, idempotent). **Token-storage deviation (from §6.7's SSM note, approved):** the Plaid access token is stored on `linked_accounts.access_token` (migration 0002), not SSM — access tokens are created dynamically per user/Item, which doesn't fit boot-time SSM hydration and can't work in local dev; RLS-protected + disk-encrypted, alongside the transaction data it unlocks. Local dev reads keys from `.env` (`PLAID_CLIENT_ID`, `PLAID_SANDBOX_SECRET`, `PLAID_PRODUCTION_SECRET`, `PLAID_ENV`); prod from SSM. Real accounts still linked exactly once, at the end.

### 6.8 Recurring-item detection
Normalize each line item to a **canonical name** (via the LLM, with pinned naming conventions), count occurrences per `canonical_name` over a window (e.g. 3+ in 90 days), flag as recurring. Name-based (not brand-based) means "buys 2% milk weekly" is caught even when the brand rotates — and it's specific enough to feed a comparable spec, unlike category-level counting which would flag all of "Dairy."

> **Recurring shipped (Phase 4).** `GET /api/recurring` computes it **on the fly** from confirmed line items in a trailing window (default 90 days) — no materialization/background job at single-user scale, always fresh; `recurring_items` stays reserved for Phase 5. Canonical key = the LLM's `normalized_name` (falls back to a light normalization of `raw_name` for manual items). **Occurrences = distinct shopping trips** (transactions), so a single stock-up of 3 doesn't count; recurring at ≥3 trips. Returns avg unit price (`price_cents / quantity`) + a per-day price series for the sparkline. Pure detection is unit-tested; verified end-to-end in-app (3 stores' "GV MILK 2%"/"MILK 2% GAL"/"2% MILK" collapsed to one `milk, 2%` with a 3-point price history; a 2-trip item was excluded). Insights gained a "Recurring items" section (name · bought N× · avg/unit · sparkline). The "find it cheaper" leg is Phase 5.

### 6.9 Cheaper-store finder (physical / Kroger-only for now)
The recalibrated, category-based version. **Online price comparison is deferred**, so the price source right now is Kroger; other nearby stores are shown on the map without prices.

1. **Build a comparable spec.** The LLM turns the item into `{ category, attributes (e.g. fat %, dairy/plant), size }` plus a **substitution tightness**: `strict` (same attributes, size ±20%), `medium` (any within category, compared per-unit), `loose` (anything shelved under the category). **Conservative default:** never cross dairy↔plant or organic↔non-organic unless the user opens it up.
2. **Find candidate stores.** Google Places Nearby Search within the user's radius (drawn as a map circle); Kroger Location API for Kroger banners.
3. **Fetch a shelf, not a SKU.** Kroger Products API term search (`filter.term=milk&filter.locationId=…`) returns many priced products in one call. This is the only live price source for now; non-Kroger stores appear as map pins the user can check themselves. *(Online option lookups via a shopping API are deferred.)*
4. **Normalize to price-per-unit.** Parse size from (noisy) titles — the LLM backstops the regex — convert to a common unit, filter to the spec's attribute/size tolerance, rank by unit price.
5. **Present transparently.** "Cheapest 2% milk within 3 mi: Kroger brand, 1 gal — $2.49/gal, vs the $5.99/gal Horizon on your receipt," with distance/map, stamped "as of [time]," plus a tightness control.

**Runs as background jobs** (EventBridge daily schedule → SQS → worker Lambda, one message per store to stay well under Lambda's 15-min cap), writing to `price_quotes`; the UI only reads cache. Manual search = same pipeline, user-typed, skipping the receipt-decode step.

**Honest scope note:** with the online leg deferred and only Kroger providing per-store prices, this feature is meaningfully useful only near a Kroger banner. Away from one, it still detects recurring items and maps nearby stores, but has little price data to compare until the online leg is added.

> **Finder shipped (Phase 5, gate passed).** `GET /api/finder?item&lat&lng&radius&tightness`: `build_comparable_spec()` (Gemini → search term + dimension + `exclude_terms`) → `kroger.find_locations` + `kroger.search_products` at the nearest store → `pricing.rank_products` by price-per-base-unit (volume→fl oz / weight→oz / count→ct). **strict** applies the exclude terms (never crosses dairy↔plant, organic↔non-organic, or fat level/flavor); medium/loose don't. Non-Kroger stores come from Google **Places (New)** as map pins without prices. Each seam is provider-swappable and reports "not configured" when its key is unset; upstream failures degrade gracefully (never 500). Frontend: `/finder` with **browser geolocation + a 1–25 mi radius slider** (user-flow §8c), the tightness toggle, a `@vis.gl/react-google-maps` map (radius circle + store pins), and the ranked list ("Best" badge, per-unit + total, store + "as of"); reached from a recurring item's "Find it cheaper →" or a manual search. **Verified end-to-end live + in-browser** near a real Kroger: 2% milk → Kroger gallon **$3.59 = 3¢/fl oz** ranked over the half-gallons, strict returning 2%-only; map rendered with store pins. Two implementation notes: parse_size handles fractional sizes ("1/2 gal" = 0.5, caught by live data); the plan's background-job + `price_quotes` cache is deferred to deploy (EventBridge→SQS→worker) — at single-user on-demand volume the finder fetches synchronously and stamps "as of". "vs your usual" comparison deferred (recurring avg is per-purchase, finder price per-fl-oz — needs unit reconciliation).

---

## 7. Security & privacy
- Auth-gate everything (Supabase Auth), even as a single user.
- **Row-Level Security, enforced for real (decided):** RLS policies scoped to `user_id` on every table, made effective from Lambda by setting the verified JWT's claims on the DB session per request. Service-role/direct connections bypass RLS, so the app never uses them for user-data queries. Queries still carry explicit `WHERE user_id` filters — RLS is defense in depth, not the primary filter.
- **Plaid webhook signature verification** on the public webhook endpoint before any processing.
- **Receipt photos are not retained** (decided): deleted from Storage on confirm; extracted data + raw JSON are the record. GPS EXIF is stripped even during the transient window.
- Never store bank credentials — Plaid holds those; Plaid tokens and all API keys live in **SSM Parameter Store (SecureString)**, loaded by the Lambdas. The React frontend never sees a secret. CORS is locked to the frontend origin.
- Prices are point-in-time snapshots — always show "as of" timestamps and link out to verify.
- All price data currently comes from official APIs (Kroger, Google Places, Plaid). If the online leg is added later via a scraping aggregator, treat it as fallback, not foundation, and mind the ToS.
- LLM: the free Gemini tier may use content to improve Google's products — switch to a paid tier before this handles real/sensitive data beyond personal prototyping.

---

## 8. External services & what each is for

| Service | Purpose | Notes |
|---|---|---|
| Gemini (free tier) | Receipt extraction, categorization, name/size normalization, comparable-spec building | Backend (`google-genai` Python), behind `extract_receipt()`. Free tier now → paid tier before non-prototype use. |
| Plaid | Bank sync (Chase etc.) now; Apple Card later | `plaid-python`, tokens server-side. Apple Card via Plaid's FinanceKit-based flow (needs iOS agent). |
| Supabase | Postgres + Auth + Storage | Core backend |
| Google Places | Nearby stores within radius | Physical discovery |
| Google Maps JS | Radius circle UI | `@vis.gl/react-google-maps` |
| Kroger Products/Location | Official per-store grocery pricing | Free public tier; ~1,600 calls/day/endpoint. Only live price source for now. |
| UPC lookup (optional) | Lock onto a specific product | Only for exact-SKU mode |
| Textract (optional) | Low-confidence OCR fallback | ~$0.01/page |
| SerpApi *(deferred)* | Online / cross-retailer prices | Not integrated now — add with the online leg of the finder. |

---

## 9. Phased roadmap

**Phase 1 — Core loop (no external deps).** React/Vite frontend + FastAPI backend scaffold (SAM template: API Lambda + worker Lambda + SQS + EventBridge from day one, even if the worker is idle), Supabase + auth with **RLS policies + per-request JWT claims wired from the start**, manual entry, confirm screen, responsive table, categories (incl. tax/tip), pie chart with date range + empty states + the **itemized/unitemized aggregation rule**, source-agnostic `POST /api/ingest`. **Schema deliverables locked here:** integer-cents money columns, `purchased_on` local dates, `review_status` + `reconciliation_reviews` table, `canonical_name`-keyed `recurring_items`, and the fixed category taxonomy seeded into `categories` (locked in Phase 1 review at **23**: Produce, Dairy, Meat & Seafood, Bakery, Pantry, Frozen, Beverages, Snacks, Household, Personal Care, Health/Pharmacy, Pet, Dining Out, Electronics, Clothing, Transportation & Gas, Housing & Rent, Utilities & Bills, Entertainment & Subscriptions, Travel, Other — plus system categories Tax and Tip). Seeded per user by a trigger on `auth.users` (with backfill for existing users). The taxonomy is embedded in the Phase 2 extraction prompt, so it must be locked before any data is ingested; renames are safe later (IDs stable), but merges/splits mean re-mapping historical rows. *Fully usable on day one.*

**Phase 2 — Receipt scanning.** Camera capture → image normalization (see §6.1) → Gemini extraction (free tier) → Pydantic validation → confirm → ingest. The extraction prompt constrains categories to the Phase 1 taxonomy (the model must choose from the seeded list, never invent new ones). Reconciliation (merge/skip/replace/keep-both). *Delivered: `extract_receipt()` seam (Gemini, mock fallback when no key), image normalization, confirm screen, and attended reconciliation — the merge/skip/replace/keep-both dialog wired into both the scan and manual-entry flows (see the §6.3 note). Receipt photos are held only for the extraction request and never persisted, so there's nothing to delete on confirm.*

**Phase 3 — Bank sync.** Plaid link, `/transactions/sync`, **webhook endpoint with Plaid signature verification** → ingest, unattended reconciliation into the **needs-review queue** (never auto-merged), plus the review UI. Manual Apple Card CSV import routed through the same ingest (proves the path the sync agent will use). Iterate in Sandbox only; link real accounts once at the end (10-Item lifetime cap). *Delivered (Sandbox): the whole loop — Plaid Link "Connect a bank" UI + `/exchange`/`/sync`/verified webhook (§6.7 note), unattended reconciliation + the `/review` queue (§6.3 note), Apple Card CSV import (auto-creates an "Apple Card" connected account; matches → review queue; idempotent), and the Transactions "Needs review" filter + "scan a receipt to itemize" on unitemized rows (which triggers the attended merge). Verified end-to-end in-app against live Sandbox: Connect → First Platypus Bank → 30 transactions ingested; CSV import queued a duplicate for review. Real-bank link + deploy remain (human-gated).*

**Phase 4 — Recurring items.** Canonical-name normalization + detection + a "recurring" view. *Delivered: `GET /api/recurring` (on-the-fly, canonical-name grouping, ≥3 distinct trips in a 90-day window, avg unit price + price series) and the Insights "Recurring items" section with per-item sparkline. Verified in-app. See the §6.8 note.*

**Phase 5 — Cheaper-store finder (physical/Kroger-only). Gate: before starting, check Kroger's store locator for banners within your realistic radius** — if none exist near you, either pull the online-price leg into this phase or park it and treat Phases 1–4 as the complete product; do not build a price comparer whose only price source isn't reachable. If the gate passes: comparable specs + substitution tightness, Kroger prices + Google Places radius map, background jobs + `price_quotes` cache, per-unit ranking, manual search. *Online price comparison (SerpApi or alternative) otherwise deferred.* **Gate passed (Kroger nearby). Delivered — comparable-spec builder, Kroger price leg (live), per-unit ranking, geolocation + radius-slider map UI, tightness, manual search; verified live + in-browser. Pending: enabling Places API (New) for non-Kroger pins; background-job price caching at deploy. See the §6.9 note.**

**Phase 6 (later, optional) — Apple Card auto-sync.** Small iOS agent using **Plaid's SDK over FinanceKit** (§11), delivering Apple Card into the same Plaid pipeline. Requires an Apple Developer account + FinanceKit entitlement.

---

## 10. Known hard parts & mitigations

- **Receipt accuracy on messy thermal paper** → confirm screen + optional Textract fallback.
- **Reconciliation false matches** → conservative match thresholds; user chooses on uncertainty.
- **Cross-store price data is fragmented** → with online deferred, Kroger is the only live per-store source; other nearby stores are mapped without prices. The finder is most useful near a Kroger banner until the online leg is added.
- **"Similar item" is subjective** → visible, conservative substitution tightness; never silently cross dietary lines.
- **Size parsing from titles** → per-unit normalization with the LLM as regex backstop.
- **Rate limits / cost** → background jobs + aggressive caching; run only for recurring/searched items.
- **LLM free-tier privacy** → Gemini free tier may train on your data; switch to a paid tier before non-prototype use.
- **Lambda packaging with native libs** → `pillow-heif` needs a Lambda-matching build (SAM build container or container-image deploy); budget an hour for this in Phase 2, not mid-debug.
- **Lambda ↔ Postgres connections** → always go through Supabase's Supavisor transaction pooler (port 6543) with SQLAlchemy `NullPool`; direct connections from many invocations will exhaust the DB.
- **Serverless cost drift** → always-free covers this app at single-user scale, but keep the $1 budget alert, avoid NAT Gateways/Elastic IPs entirely; the Function URL (already chosen) is also the cheapest front door.
- **RLS plumbing bugs** → mis-set per-request JWT claims show up as silently *empty* query results, not errors; build a tiny smoke test (one query as user A must see A's rows and zero of a synthetic user B's) into CI from Phase 1.
- **Cold starts** → 1–3s after idle with this dependency set; expected, not a bug. Trim top-level imports or add a free warm-ping only if it actually bothers you.
- **Timezones** → `purchased_on` is a local calendar date by design; never convert receipt wall-clock times to UTC dates or late-night purchases will file under the wrong day.

---

## 11. Deferred: Apple Card sync agent (nothing to build now)

**Updated approach (early 2026):** Plaid now offers an Apple Card integration, so the eventual agent should go **through Plaid rather than raw FinanceKit** — this unifies Apple Card with Chase under one pipeline. But this does **not** remove the native-iOS requirement, and it does **not** make Apple Card reachable from the web app.

**Why it's still native-iOS-only.** Plaid's Apple Card support is a *wrapper around FinanceKit*, not a normal credentialed bank connection. Apple Card data lives on-device in Wallet; the integration requires iOS 17.4+ and the app to be granted FinanceKit/Wallet access in iPhone Settings. There is no web Plaid Link screen where you enter Apple Card credentials and receive transactions server-side — that path does not exist. So a pure web app cannot sync Apple Card even via Plaid; a native iOS surface is unavoidable.

**What to build when the time comes** (fully isolated — the web app is never touched):
- A small iOS app that uses **Plaid's SDK to run the Apple Card / FinanceKit flow** on-device. Once linked, transactions flow into your existing Plaid setup and land at `POST /api/ingest` with `source: "plaid"`, distinguished by the `linked_accounts` row (`is_apple_card = true`, `sync_mode = device`).
- Everything downstream — idempotent ingest, source-agnostic reconciliation, categorization, charts — already handles it with no changes.

**Consequences to remember:**
- Because the data is on-device, ongoing sync is **device-mediated**: Apple Card updates reach the web app only after the iOS agent runs (unlike Chase, which is fully server-side and appears everywhere instantly). Plaid/FinanceKit background delivery keeps the lag low but doesn't eliminate the dependency.
- Prerequisites: $99/yr Apple Developer account + the FinanceKit entitlement (discretionary, can be slow — request early). The host iOS app still appears to need its own Wallet/FinanceKit access.
- Keep the manual Apple Card CSV import (Phase 3) as a permanent fallback in case the entitlement is delayed or denied.

**Two traps to avoid:**
- The Apple Card *issuer* is in transition (Goldman Sachs, with a reported move underway). This is irrelevant to the integration — the path is FinanceKit regardless of issuer.
- Online, "Apple + Plaid" pages often refer to **"Apple Bank,"** an unrelated New York savings bank — *not* Apple Card. Don't let those suggest a web-credential path exists.

---

## 12. Cost model (single user)

**To build:** essentially free if you write it yourself — every service has a sandbox/free tier. Budget **$0–20** in throwaway API credits for testing.

**To run (current scope — Gemini free, online comparison deferred):**

| Item | Cost |
|---|---|
| Gemini (extraction) | **$0** — free tier for now |
| Plaid (bank sync) | **$0** — trial plan covers real data for up to 10 linked accounts |
| Google Places + Kroger | **$0** — well under free caps at single-user volume |
| Supabase (DB/auth/storage) | **$0** — free tier; Storage stays near-empty since receipt photos are deleted on confirm |
| Frontend host (static React build) | **$0** — Cloudflare Pages (locked default) |
| Backend (AWS serverless: Lambda + SQS + EventBridge) | **$0/mo** — permanent always-free allowances (1M Lambda requests/mo, SQS + EventBridge free tiers) dwarf single-user volume. Sign up on the **Paid Plan** ($100–200 credits, no 6-month account closure), $1 budget alert, no NAT Gateway/Elastic IPs. |
| SerpApi | **$0** — deferred |

**Bottom line:** **~$0/month, permanently** — every layer sits on a durable free tier or permanent always-free allowance, with no sleeping-backend compromise (Lambda answers webhooks and fires crons reliably). The cost you pay instead is setup complexity: SAM/IAM/Lambda packaging in week one. Optional: ~$12/yr domain; **$99/yr Apple Developer account only at Phase 6**.

**What raises it later:** switching Gemini to a paid tier (still cents/month at this volume); adding the online-price leg (SerpApi from $25/mo or cheaper pay-as-you-go); and the **scaling cliff** if this ever becomes multi-user — Plaid Transactions becomes a per-account subscription (possible plan minimums), Supabase moves to a paid tier, and Lambda/SQS usage eventually exceeds always-free (though that takes far more than a handful of users).
