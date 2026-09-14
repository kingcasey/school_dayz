-- CNN 10 current events — reports and the daily log.
--
-- Run once in the Supabase SQL editor. Then, under Authentication:
--   * turn OFF "Allow new users to sign up". The publishable key is public in
--     index.html, so with sign-ups on, anyone could make themselves an account
--     and read her work. Everything below trusts "authenticated" to mean family.
--   * add the one family account by email and password.
-- Then paste the project URL and publishable key into SB_URL / SB_KEY in index.html.

create table cnn10_reports (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) default auth.uid(),
  student_name  text not null,
  air_date      date,                -- date of the episode she analysed
  week_of       date,                -- Monday of that school week
  slug          text not null,       -- the segment, six words or fewer
  who           text,
  what          text,
  where_        text,                -- "where"/"when" are reserved words
  when_         text,
  why           text,                -- the cause, not the event
  how           text,                -- how it reaches people outside the story
  fact          text,                -- one checkable fact
  framing       text,                -- word choice, who was interviewed, what was left out
  matters       text,
  voice         text,                -- her take, 3-4 sentences
  score         text,                -- free text: letter, points, rubric label
  feedback      text,
  graded_at     timestamptz,
  selected_at   timestamptz,         -- marked a portfolio piece; the vault files only these
  vault_path    text,                -- Work Samples/… , set by scripts/vault-sync.mjs
  feedback_path text                 -- Feedback/… , set by scripts/vault-sync.mjs
);

create table cnn10_daily_log (
  log_date   date primary key,       -- one row per day; re-saving overwrites
  story      text not null,
  why        text,
  created_at timestamptz not null default now()
);

alter table cnn10_reports   enable row level security;
alter table cnn10_daily_log enable row level security;

-- The family account sees everything. Written against app_metadata.role now,
-- although no reviewer exists yet, so that adding one later is a new user and
-- one new policy —
--   create policy "reviewer read" on cnn10_reports for select to authenticated
--     using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'reviewer'
--            and selected_at is not null);
-- — and nothing already in force has to change.
create policy "family read" on cnn10_reports for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');

-- Turning in a report is an insert, and it arrives ungraded: grading and
-- choosing portfolio pieces happen from the dashboard or a secret-key script,
-- never from the page.
create policy "family insert" on cnn10_reports for insert to authenticated
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer'
    and score is null and feedback is null and graded_at is null
    and selected_at is null and vault_path is null and feedback_path is null
  );

-- No update or delete policy on cnn10_reports, deliberately. Once a report is
-- turned in the page cannot change it — the same rule the vault keeps for
-- work samples.

create policy "family read" on cnn10_daily_log for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');

create policy "family insert" on cnn10_daily_log for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');

-- Re-saving a day's line is an update. The daily log is a note to herself,
-- not a record, so unlike a report it can be changed.
create policy "family update" on cnn10_daily_log for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'reviewer');
