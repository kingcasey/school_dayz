-- Today — what happened. The plan tab says what she does; these two tables
-- say what she did.
--
-- Run once in the Supabase SQL editor, in the same project as cnn10.sql.
-- Nothing else to switch on: sign-ups are already off, and the one family
-- account is already there.

-- One row per task she has touched: ticked, skipped, or written a note on.
-- A task nobody has touched has no row, and reads as not done.
create table day_state (
  day_date   date not null,          -- kind 'day': the day. kind 'week': that week's Monday.
  kind       text not null check (kind in ('day', 'week')),
  subject    text not null,          -- the plan row's name; '' for a one-off on its own
  item_key   text not null,          -- the task's text, lowercased, letters and digits only
  done_at    timestamptz,
  done_on    date,                   -- the school day she ticked (or skipped) it
  skipped    boolean not null default false,
  note       text,
  updated_at timestamptz not null default now(),
  primary key (day_date, kind, subject, item_key)
);

-- Things with no week-level home: a field trip, the dentist, "finish
-- yesterday's lab". Added from the day view, never from the Sheet.
create table day_extra (
  id         uuid primary key default gen_random_uuid(),
  day_date   date not null,
  subject    text,                   -- null = a loose item for the day
  text       text not null,
  created_at timestamptz not null default now()
);
create index day_extra_day_date on day_extra (day_date);

-- The page only ever sends what changed, so the database keeps the clock.
create function day_state_touch() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger day_state_touch before update on day_state
  for each row execute function day_state_touch();

alter table day_state enable row level security;
alter table day_extra enable row level security;

-- Same rule as cnn10.sql: the family account, and no future reviewer role.
create policy "family read" on day_state for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');
create policy "family insert" on day_state for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');
-- Ticking is an upsert, so it needs update as well as insert. No delete: a
-- row that stops mattering is simply never read again.
create policy "family update" on day_state for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');

create policy "family read" on day_extra for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');
create policy "family insert" on day_extra for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');
-- A one-off added by mistake can be taken back off the day.
create policy "family delete" on day_extra for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');
