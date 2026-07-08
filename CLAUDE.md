# CLAUDE.md — Spending Tracker

## What this project is

A single-user personal spending tracker: scan grocery/any receipts with the phone camera, auto-extract and categorize line items via a vision LLM, sync bank transactions via Plaid, chart spending by category over date ranges, detect repeatedly-bought items, and find cheaper equivalents at nearby stores.

Two authoritative documents live in `docs/` — read them before non-trivial work:
- `docs/implementation-plan.md` — architecture, data model, phased roadmap, every decision with its rationale.
- `docs/user-flow.md` — every screen, navigation, wait/error/empty states.

This file is the operating summary. If this file and the docs ever disagree, the docs win; flag the conflict.

## Architecture (locked)

- **Frontend:** React + Vite SPA, TypeScript strict, Tailwind, shadcn/ui, TanStack Query, React Hook Form + Zod, Recharts. Hosted on Cloudflare Pages. Typed API client generated from the backend OpenAPI schema (orval or openapi-typescript).
- **Backend:** FastAPI (Python 3.12+) on **AWS Lambda** via Mangum, behind a **Lambda Function URL** (not API Gateway — its ~29s cap can't hold a slow Gemini call). Background jobs: **SQS + worker Lambda** (no Redis, no Celery). Scheduling: **EventBridge Scheduler**. IaC: **AWS SAM**, one template. Package manager: **uv**. Lint: Ruff + Black. Tests: pytest.
- **Data:** Supabase — Postgres (SQLModel + Alembic), Auth (magic link, JWT), Storage (transient receipt images only).
- **DB connections from Lambda:** ALWAYS through Supabase's Supavisor transaction pooler (port 6543) with SQLAlchemy `NullPool`. Never direct Postgres.
- **External services:** Gemini 2.5 Flash (free tier for now) for receipt extraction behind one `extract_receipt()` function; plaid-python for bank sync; Google Places + Kroger APIs for the store finder (Phase 5); SerpApi deliberately NOT integrated (deferred).

## Non-negotiable conventions

1. **Money is integer cents.** Columns are `*_cents BIGINT`. Python uses `int`/`Decimal`, never `float`. "Within a cent" matching is `abs(a - b) <= 1`.
2. **Dates:** `purchased_on` is a local calendar `DATE` (+ optional `purchased_time`). Never convert receipt wall-clock to UTC dates.
3. **RLS is real.** Every user-data table has an RLS policy on `user_id`. Every request sets the verified Supabase JWT's claims on the DB session (`SET LOCAL role` + `SET LOCAL request.jwt.claims` inside the request transaction) so policies actually apply. Queries STILL include explicit `WHERE user_id` — RLS is the net, not the filter. Never use the service-role connection for user-data queries. CI must include the RLS smoke test: a query as user A sees A's rows and zero of synthetic user B's.
4. **One ingest door.** Every transaction source (manual, receipt, Plaid, future Apple Card) calls the same idempotent `POST /api/ingest`. Idempotency via unique `(source, external_id)`. Reconciliation matches on semantics (vendor + date ±1–2 days + total within a cent, or item overlap), never on source.
5. **Never auto-merge.** Unattended matches (webhooks, scheduled syncs) are saved with `review_status = needs_review` + a `reconciliation_reviews` row. Attended matches show the merge/skip/replace/keep-both dialog immediately.
6. **Chart aggregation rule:** itemized transactions chart line items + tax + tip (ignore total); unitemized chart their total under "Uncategorized"; `needs_review` transactions are excluded until resolved.
7. **Trust-but-verify:** every scanned/imported transaction passes a confirm/edit screen before save. On confirm, **delete the receipt photo from Storage** and null `receipt_image_path`; `raw_extraction_json` is the permanent record.
8. **Tax and Tip are their own categories** (system categories), stored at transaction level, shown as pie slices.
9. **Category taxonomy is fixed and seeded in Phase 1** (list in the plan §9). The extraction prompt embeds it; the model must pick from it (fallback `Other`), never invent. Pydantic validates category membership.
10. **Recurring detection keys on `canonical_name`** (normalized item name, lowercase, generic noun first — "milk, 2%"), with `category_id` alongside. The extraction prompt pins these naming conventions so normalization is stable across vendors.
11. **Secrets in SSM Parameter Store (SecureString)** only — never in code, .env committed, or plaintext Lambda env vars. Plaid webhook endpoint verifies the `Plaid-Verification` JWT signature before processing.
12. **Image normalization before extraction:** Pillow + pillow-heif — HEIC→JPEG, EXIF auto-rotate, downscale ≤~2000px, strip GPS EXIF. pillow-heif has native libs: build in a Lambda-matching container (`sam build --use-container`) or ship the function as a container image.

## Phase order (do not reorder; each phase is shippable)

1. **Core loop** — repo scaffold (frontend + backend + SAM template with API Lambda, worker Lambda, SQS+DLQ, EventBridge even if idle), Supabase schema + RLS wiring, seeded taxonomy, manual entry, confirm screen, transactions table UI, pie chart with date range/single-day/empty states + aggregation rule, `POST /api/ingest`. Schema locked here: cents, `purchased_on`, `review_status`, `reconciliation_reviews`, canonical-name recurring keys.
2. **Receipt scanning** — camera capture, image normalization, `extract_receipt()` (Gemini), Pydantic validation, confirm screen wiring, photo deletion on confirm, attended reconciliation dialog.
3. **Bank sync** — Plaid Link, `/transactions/sync`, verified webhook → ingest, needs-review queue + review UI, Apple Card CSV import through the same ingest. Develop in Plaid Sandbox ONLY; real accounts are linked once at the end (10-Item lifetime cap on the trial plan).
4. **Recurring items** — canonical-name detection (e.g. 3+ occurrences in 90 days) + recurring view.
5. **Cheaper-store finder** — GATED: first confirm a Kroger-family store exists within the user's realistic radius (ask the user). If yes: comparable specs, tightness control, Kroger + Places, EventBridge→SQS→worker price jobs (one message per store), `price_quotes` cache, per-unit ranking, map UI. If no: stop and ask the user whether to pull the online leg in or park the phase.
6. **(Deferred, do not build)** Apple Card iOS agent — see plan §11.

## Things only the human can do (ask when needed, don't fake)

- Create accounts: AWS (**Paid Plan**, then set a $1 budget alert immediately), Supabase project, Google AI Studio (Gemini key), Plaid dashboard (Sandbox keys first), Google Cloud (Places/Maps keys), Kroger developer account (Phase 5).
- Put each key into SSM Parameter Store.
- Click the Supabase magic-link email during auth testing.
- Link real bank accounts (Phase 3, once, at the end).
- Approve any step that would incur AWS cost beyond always-free.

## Guardrails

- Do NOT relitigate locked decisions (framework, hosting, serverless, RLS approach, never-auto-merge, photo deletion, deferred SerpApi/Apple Card). If you believe one is wrong, say so and stop — don't silently deviate.
- Do NOT create a NAT Gateway, Elastic IP, or any non-free AWS resource.
- Do NOT send real financial data anywhere new without asking; remember the Gemini free tier may train on inputs — the swap to a paid tier is the user's call, prompt them when Phase 2 goes into real use.
- Keep `extract_receipt()` provider-swappable: one module, no Gemini types leaking past its boundary.
- Prefer boring, testable code over clever; this is a solo-maintained personal app.
- Update `docs/implementation-plan.md` when reality forces a change, in the same commit as the change.

## Regression testing (MANDATORY)

New code must never silently break existing functionality. This is enforced, not trusted:

1. **Every new feature ships with its regression tests in the same commit/PR.** Nothing merges without tests that pin the new behavior.
2. **The route-inventory guard is law.** `backend/tests/test_route_inventory.py` fails if any API route lacks a test and isn't in its shrink-only `KNOWN_UNTESTED` backlog — so a new endpoint *cannot* merge untested. When you add/close a route's test, move it from `KNOWN_UNTESTED` into `TESTED`; never grow the backlog.
3. **CI runs the full suite + coverage on every PR** (see the CI/CD design). Coverage must not drop.
4. **Layers:** pure unit for logic (reconcile, pricing, recurring, taxonomy, extract, images, auth, CORS parsing); integration against a real disposable Postgres for anything touching DB/RLS/ingest/reconcile (the RLS smoke test is the crown jewel); frontend vitest for UI logic + key components/flows.
5. **Never hit real external services in a test** — Gemini/Plaid/Kroger/Places are mocked or faked; a real API call in a test is a bug (flaky, costly, and Plaid Items are lifetime-capped).
6. **Fix a bug → write the failing test first**, then fix (e.g. the config-CORS parse and migration-drift regressions).

## Definition of done (each phase)

Deployed and reachable (frontend on Cloudflare Pages, backend via `sam deploy`); pytest + frontend tests pass; the RLS smoke test passes; **the route-inventory guard passes and every new endpoint/behavior has a regression test (see Regression testing)**; the plan's relevant user-flow states (loading/empty/error) exist, not just the happy path; and a short note of what changed appended to the phase's section in the plan.
