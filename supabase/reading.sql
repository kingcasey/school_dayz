-- Reading — how far she got. One row per book per day she read it: the page
-- she read to. Pages read that day is this page less the last one before it.
--
-- Run once in the Supabase SQL editor, in the same project as day.sql.

create table reading_page (
  book_key   text not null,          -- the book's title, lowercased, letters and digits only
  day_date   date not null,
  page       integer not null check (page > 0),
  updated_at timestamptz not null default now(),
  primary key (book_key, day_date)
);

create function reading_page_touch() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger reading_page_touch before update on reading_page
  for each row execute function reading_page_touch();

alter table reading_page enable row level security;

-- Same rule as day.sql: the family account, and no future reviewer role.
create policy "family read" on reading_page for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');
create policy "family insert" on reading_page for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');
create policy "family update" on reading_page for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');
-- A page typed on the wrong day can be cleared.
create policy "family delete" on reading_page for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');
