# TrackIt — marketing site

The public landing page for TrackIt, with an email waitlist. Independent of the app in
`../frontend`: its own lockfile, its own Cloudflare Pages project, no shared code.

- **Stack:** Vite + React + TypeScript + Tailwind. No runtime dependencies beyond React —
  both charts are hand-rolled SVG rather than a chart library.
- **Design:** monochrome UI; the only color on the page comes from the category palette,
  so the data is the only thing that reads as colored.
- **Waitlist:** a Cloudflare Pages Function (`functions/api/waitlist.ts`) that writes to a
  `waitlist_signups` table in the existing Supabase project, using the publishable (anon)
  key — an RLS policy lets anon INSERT there and nothing else.
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

## Setup

All of it is automated by the `website` job in `.github/workflows/deploy.yml`, which runs on
every push to `main` that touches `website/**`. It creates the Pages project if missing,
applies `supabase/waitlist_signups.sql` (idempotent), pushes the Function's environment, and
deploys. **No new credentials are required** — it reuses the `VITE_SUPABASE_URL` variable and
the `VITE_SUPABASE_PUBLISHABLE_KEY` secret the app's own build already uses.

### Why the anon key, not service-role

`waitlist_signups` has RLS on with a single policy: `anon` may INSERT, nothing else. So the
key the Function carries can add a row and cannot read the signup list back, cannot modify
it, and has no reach into user data. Service-role would bypass RLS entirely for no benefit
(CLAUDE.md §3). Note `Prefer: return=minimal` is load-bearing — anon has no SELECT policy,
so asking PostgREST for the inserted row back would fail.

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
