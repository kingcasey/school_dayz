-- The Log — the #log view, for a parent. A read-only copy of her daily and
-- weekly notes.
--
-- The notes are the official record, and they live in the Obsidian vault.
-- scripts/publish-log.mjs copies each one in here whenever it changes, with
-- the frontmatter taken off (all but its status) and her name replaced. The
-- page only reads.
--
-- Run once in the Supabase SQL editor, in the same project as day.sql.

create table daily_log (
  file       text primary key,        -- the note's file name: 2026-09-30.md, or 2026-10-05 week.md
  kind       text not null check (kind in ('day', 'week')),
  log_date   date not null,           -- the day, or the week's Monday
  status     text check (status in ('partial', 'complete')),   -- null: the note doesn't say
  body       text not null,           -- the Markdown, frontmatter off, name replaced
  sha        text not null,           -- so the script can tell what's changed
  updated_at timestamptz not null     -- when the note was last saved in the vault
);
create index daily_log_date on daily_log (log_date desc);

alter table daily_log enable row level security;

-- Reading it: the parent's account only — app_metadata.role = 'parent', the
-- same claim the lesson plans' bucket reads (literature.sql). app_metadata,
-- never user_metadata: only the service role can set app_metadata.
--
-- There is no insert, update or delete policy, deliberately. Nobody changes
-- the log from the page; the script writes with the secret key, which
-- bypasses RLS.
create policy "parent read" on daily_log for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'parent');

-- Made before 2026-10-01, when both family accounts could read it? Swap the
-- policy over instead of running the above:
--
--   drop policy "family read" on daily_log;
--   create policy "parent read" on daily_log for select to authenticated
--     using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'parent');
