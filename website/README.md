# TrackIt — marketing site

The public landing page for TrackIt, with an email waitlist. Independent of the app in
`../frontend`: its own lockfile, its own Cloudflare Pages project, no shared code.

- **Stack:** Vite + React + TypeScript + Tailwind. No runtime dependencies beyond React —
  both charts are hand-rolled SVG rather than a chart library.
- **Design:** monochrome UI; the only color on the page comes from the category palette,
  so the data is the only thing that reads as colored.
- **Waitlist:** a Cloudflare Pages Function (`functions/api/waitlist.ts`) that writes to a
  `waitlist_signups` table in the existing Supabase project.
- **Cost: $0.** Cloudflare Pages free tier (unlimited static requests, 100k Function
  invocations/day) plus the Supabase free tier already in use. Nothing new is billable.

## Local development

```bash
pnpm install
pnpm dev      # NOTE: the app's dev server also defaults to 5173/5199 — check the printed port
pnpm test     # vitest: landing-page components + the waitlist Function
pnpm lint
pnpm build
```

`pnpm dev` serves the static site only — Pages Functions do not run under Vite, so the
waitlist form will report a connection error locally. To exercise the real endpoint:

```bash
pnpm build && npx wrangler pages dev dist --compatibility-date=2024-11-01
```

## One-time setup

### 1. Create the Supabase table

Run `supabase/waitlist_signups.sql` once in the Supabase SQL editor. It is deliberately not
an Alembic migration — the app's migration chain owns user-data tables, and mixing a
marketing table into it invites schema drift.

### 2. Create the Cloudflare Pages project

In the Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git, point at
this repo and set:

| Setting              | Value            |
| -------------------- | ---------------- |
| Production branch    | `main`           |
| Root directory       | `website`        |
| Build command        | `pnpm build`     |
| Build output         | `dist`           |

Add a build-watch path of `website/*` so app-only commits don't trigger a site rebuild.

This is a **second, separate** Pages project. Do not point it at the existing
`spending-tracker-1o6` project, which serves the app.

### 3. Add the environment variables

Pages project → Settings → Environment variables. Add to **both** Production and Preview,
as **encrypted**:

- `SUPABASE_URL` — e.g. `https://xxxx.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — the service-role key

The service-role key never reaches the browser; it lives only in the Function. It is used
here against the marketing table only — never user data (see CLAUDE.md §3).

## Reading the signups

```sql
select email, country, created_at
from public.waitlist_signups
order by created_at desc;
```

## Structure

```
functions/api/waitlist.ts   POST /api/waitlist — validation, honeypot, Supabase insert
src/App.tsx                 the whole page: hero, how-it-works, chart, features, CTA
src/components/
  AccountsFlow.tsx          hero visual — three accounts funnelling into one timeline
  AppSnapshot.tsx           the app's Home spending pie, reproduced (see note below)
  WaitlistForm.tsx          the email form (idle / submitting / joined / error)
src/lib/categories.ts       category palette, mirrored from the app
src/lib/waitlist.ts         fetch wrapper; a duplicate signup is a success, not an error
supabase/                   the one-time table DDL
```

## Keeping the pie honest

`src/components/AppSnapshot.tsx` reproduces the app's Home spending pie — same category
hues, same 55/95 inner/outer radii, same 2px white slice gaps, same hatched Tip and
"Not itemized" fills. The palette is copied into `src/lib/categories.ts` rather than
imported, because the site is independent of the app's build.

**If `frontend/src/lib/categories.ts` changes, change `website/src/lib/categories.ts` too**,
or the marketing chart quietly stops matching the product.
