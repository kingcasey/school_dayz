-- Ticks on the lesson plans (#ela, #history) — what a parent has covered.
--
-- A plan's text still comes from the vault, through the private
-- `literature` bucket (literature.sql). Its [ ] and [x] are ignored now: this
-- table is the only record of what's been ticked.
--
-- Run once in the Supabase SQL editor. Nothing here touches an existing table
-- or policy — day_state, where her own ticks live, is left exactly as it is.

-- One row per item anyone has touched. Unticking keeps the row with
-- checked_at null, the way day_state keeps done_at null; an item with no row
-- reads as not ticked.
create table plan_progress (
  plan       text not null,          -- 'ela' (literature) or 'history' (U.S. History)
  week       int  not null,          -- the item's week, for reading rows in the dashboard
  item_key   text not null,          -- sha-256 of "Week N", a newline, and the item's text
  checked_at timestamptz,            -- null = unticked
  primary key (plan, item_key)
);

alter table plan_progress enable row level security;

-- Only a parent: app_metadata.role, which only the service role can set.
-- Her account can neither read nor write any of it.
create policy "parent read" on plan_progress for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'parent');
create policy "parent insert" on plan_progress for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'parent');
-- Ticking is an upsert, so it needs update as well as insert. No delete:
-- unticking is an update, and a row for an item that's since been reworded
-- is simply never read again.
create policy "parent update" on plan_progress for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'parent')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'parent');
