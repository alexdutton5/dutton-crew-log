-- ============================================================
-- Dutton Plumbing — Crew Log app database schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query,
-- paste the whole file, press Run.
-- ============================================================

create table if not exists public.crew_logs (
  id           bigint generated always as identity primary key,
  person       text not null,                                   -- "Kyle Jelevach" / "Caleb Huston"
  date         date not null,                                   -- day worked, YYYY-MM-DD
  customer     text not null,                                   -- Customer / Site
  description  text not null,                                   -- Work performed
  hours        numeric not null check (hours > 0 and hours < 24),
  submitted_at timestamptz not null default now()
);

-- Keeps the dashboard reads fast (newest days first).
create index if not exists crew_logs_date_idx
  on public.crew_logs (date desc);

-- ============================================================
-- Row Level Security
-- The crew's phones use the public anon key, so lock the table
-- down to INSERT-only for anon: they can add rows, nothing else.
-- ============================================================
alter table public.crew_logs enable row level security;

drop policy if exists "crew_insert_only" on public.crew_logs;
create policy "crew_insert_only"
  on public.crew_logs
  for insert
  to anon
  with check (true);

-- NOTE: reads (dashboard syncs) use the service_role key, which
-- bypasses RLS. That key lives server-side only — NEVER put it in
-- config.js or anywhere in this web app. anon can INSERT only:
-- no SELECT, no UPDATE, no DELETE.

-- ============================================================
-- ADDENDUM (live DB has since diverged from the file above:
-- crew_logs gained job_name/location/status/photo_urls columns,
-- and anon SELECT was enabled so the app's History tab can read.)
-- 2026-10-23: allow the crew to EDIT their entries from the app
-- (History -> entry -> Edit entry). Same trust model as INSERT:
-- the app has no login, so anyone with the app link can edit.
-- ============================================================
drop policy if exists "crew_update" on public.crew_logs;
create policy "crew_update"
  on public.crew_logs
  for update
  to anon
  using (true)
  with check (true);

-- ============================================================
-- ADDENDUM 2026-10-31: CLOCK upgrade — crew_members (PIN
-- hashes) + clock_punches tables with anon SELECT/INSERT/
-- UPDATE policies. Full migration in supabase-clock-migration.sql.
-- ============================================================
