-- Marketing waitlist for the TrackIt landing page.
--
-- Deliberately NOT an Alembic migration: the app's migration chain owns user-data
-- tables, and mixing a marketing table into it invites the schema drift we've
-- already been bitten by. Run this once, by hand, in the Supabase SQL editor.

create table if not exists public.waitlist_signups (
  id          bigint generated always as identity primary key,
  email       text        not null,
  referrer    text,
  country     text,
  created_at  timestamptz not null default now()
);

-- Makes a repeat signup a 409 rather than a duplicate row, which is what the
-- Pages Function translates into "You're already on the list."
create unique index if not exists waitlist_signups_email_key
  on public.waitlist_signups (lower(email));

-- RLS on with zero policies: anon and authenticated can do nothing at all.
-- The Pages Function reaches this table with the service-role key, which bypasses
-- RLS by design. No browser-side client ever touches it.
alter table public.waitlist_signups enable row level security;
