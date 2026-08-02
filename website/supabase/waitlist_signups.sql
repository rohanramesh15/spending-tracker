-- Marketing waitlist for the TrackIt landing page.
--
-- Deliberately NOT an Alembic migration: the app's migration chain owns user-data
-- tables, and mixing a marketing table into it invites the schema drift we've
-- already been bitten by. Applied idempotently by the website deploy job.

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

alter table public.waitlist_signups enable row level security;

-- The Function reaches this table with the PUBLISHABLE (anon) key, never the
-- service-role key — nothing here is user data, and CLAUDE.md §3 reserves
-- service-role for nothing at all. anon is granted exactly one capability:
--
--   INSERT  yes — that is the entire feature
--   SELECT  no  — so a leaked key cannot scrape the signup list
--   UPDATE  no
--   DELETE  no
--
-- Reading the list is done from the Supabase dashboard as an authenticated
-- human, which RLS does not restrict for the table owner.
grant insert on public.waitlist_signups to anon;

drop policy if exists waitlist_signups_anon_insert on public.waitlist_signups;
create policy waitlist_signups_anon_insert
  on public.waitlist_signups
  for insert
  to anon
  with check (true);
