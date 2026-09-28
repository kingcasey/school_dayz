-- Words beside the keys — so a day's ticks can be read back as written.
--
-- day_state and plan_progress know an item by a key: squashed text, or a
-- hash. That's right for matching a tick to its line, but the words can't be
-- got back from it. These columns keep the words too, sent by the page with
-- each tick, so scripts/export-day.mjs can write a day's ticks into the vault
-- without reading anything but these tables.
--
-- Run once in the Supabase SQL editor, BEFORE deploying the page that sends
-- them: until these columns exist, a save that includes them fails.
--
-- Columns only. No policy changes — the existing ones cover every column —
-- and nothing already in a row changes. Ticks from before this read as null.

-- Today's task as it read when ticked: the plan cell's line, or the one-off's text.
alter table day_state     add column if not exists item_text text;

-- An #ela or #history item as it read when ticked, label included.
alter table plan_progress add column if not exists item_text text;

-- The book's title as the reading tab gives it, beside book_key.
alter table reading_page  add column if not exists book_title text;
