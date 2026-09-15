# School

One phone-first page, six views, no build step. The plans come from tabs of
one Google Sheet, published to the web as CSV, and the Sheet is the only place
they're edited. What actually happened — what she ticked, her notes, one-offs,
her CNN 10 work — is written from the page into Supabase. **The sheet is
intent; the app is record.** The whole page sits behind one family sign-in.

| view | reads | state |
|---|---|---|
| **Today** (opens here) | `plan` tab, plus what's been done from Supabase | built |
| **Plan** — the week at a glance | `plan` tab | built |
| **Reading** — reading now / to read / finished | `reading` tab | built |
| **Wins** — accomplishments, by year | `wins` tab | built |
| **CNN 10** — daily line and weekly current-events report | Supabase, signed in | built |
| **Map** — subjects and credits to 12th grade | `map` tab | stub, and last in the tabs until it isn't |

Plain HTML/CSS/JS in `index.html`. No framework, no npm. Views are linkable:
`#today`, `#plan`, `#reading`, `#wins`, `#cnn10`, `#map` — the hashes are
fixed, so tab order can change without breaking a bookmark.

**Every view asks for the family sign-in first**, once per browser. Anyone
helping on the day needs it on their device too. Signing out (at the foot of
every view) signs out that device only, and clears the saved copies from it —
the sheet tabs included — except a half-written CNN 10 report. The published
Sheet CSVs themselves are still public; the sign-in guards what's in
Supabase.

## Where it runs

Deployed from `main` on Vercel — every push republishes. There is no build
step: the host serves `index.html` as-is, framework preset "Other", build
command empty, output directory `./`. It is served from a custom subdomain,
which is deliberately not written down here.

GitHub Pages is still switched on for the old address, but is no longer the
one that matters. If a Pages build fails, it is not the live site.

## Connecting it

In the Sheet: **File › Share › Publish to web**, pick a tab, choose **CSV**,
Publish. Google hands back a link shaped like:

```
https://docs.google.com/spreadsheets/d/e/2PACX-1vABC.../pub?gid=123456&single=true&output=csv
```

The `2PACX-...` id is the same for every tab. The `gid=` number is different
per tab. Both go at the top of `index.html`:

```js
const PUB_ID = "2PACX-1vABC...";
const GID = { plan: "0", map: "", reading: "789012", wins: "345678" };
```

A tab left as `""` is simply not connected. Its view says so and the rest of
the page carries on.

## The `plan` tab

Week-level, subjects down the left, weeks across the top, section dividers in
between. It is both the **Plan** view and the source of every day on
**Today**. The page looks for:

- a row starting with **Week** in column A, week numbers running across it
- a row starting with **Date**, the Monday of each week under it — Today needs
  this to know which day is which
- a row starting with **Subject** with **Source** beside it
- beside Source, three optional columns found by their headings, in any order:
  **Time**, **Who** and **Days** (below)
- everything below that: one row per subject
- a row with a name and nothing else = a **section divider**
- a blank column = a week off; `--` in a cell = nothing that week

```
Subject | Source | Time | Who | Days | week 1 | week 2 | …
```

Freeze through `Days` and the current week is already on screen.

| column | holds |
|---|---|
| `Time` | the subject's usual time. Blank means no time |
| `Who` | `mom` / `adult`, `dad`, `own`. Blank falls back to the section the row sits under |
| `Days` | which weekdays it runs: `Mon-Fri`, `Mon & Wed`, `Tue & Thu`, `Fri`, `Sun`. Blank means every school day |

Section names set the left-edge colour: *Rituals* navy, *Parent Led* ochre,
*Self-Paced* periwinkle, *Activities* plum. Trombone and STEM lab stay plum.

### Writing the week — one task per line

Each line of a week's cell is one task, and how the line starts says when it's
due. One subject can have as many lines as it needs:

```
Watch the lesson video               ← every day this subject runs
Mon Unit 1 practice set              ← Monday only
Mon Read pp. 22–25                   ← a second task, same day
By Fri DO Week 1 problem set         ← any day she likes, due Friday
```

| line starts with | means |
|---|---|
| nothing | **daily** — every day the subject runs, per its `Days`. It's back tomorrow whether or not it was done today |
| `Mon`, `Tue`, `Tues`, `Thu`, `Mon & Wed`, `Mon/Wed`, `Mon-Wed` | **pinned** to those days |
| `By Fri`, `By Wed` | **hers to pace** — on every school day of the week with a *due Fri* chip, until she ticks it |

After that, a line reads like any cell always has:

| in a line | means |
|---|---|
| `9:55 ` after the day | that task's time, overriding `Time` |
| `@dad` `@adult` `@own` | that task's who, overriding `Who` |
| `// …` at the end | a note from you, shown in italics under the task |
| a pasted link | a tappable link, protocol trimmed so it stays short |
| `#cnn10` (or `#reading`, `#wins`, …) | a link to that tab — `Write today's line #cnn10` shows *CNN 10 →* |
| `--` on its own | nothing that week |

So `Mon 9:55 @dad Unit 1 practice set // bring the calculator` is Monday, at
9:55, with Dad, with a note. A line that is only a day (`Mon`) takes its text
from the subject's name.

A line that happens to start with a weekday word is read as one — `Sun and
Moon unit` becomes *and Moon unit*, on Sunday. Put something in front of it
(`Unit: Sun and Moon`).

**`x` and `>` are no longer typed in the Sheet.** Done and carried are state,
and live in Supabase. If either turns up at the start of a line, the marker is
ignored and the task still shows. Don't mark anything done in the Sheet — two
places saying what's done will disagree within a fortnight.

The CNN 10 weekly report is just a `By Fri` line on the Current Events row.

### Break, Lunch, Note and Evening

Ordinary rows on the plan tab, placed in the day by where they sit. The Plan
view leaves them out.

- **Break** and **Lunch** are grey pauses with no checkbox. With a `Time` and
  an empty week cell they run on their `Days` without anything typed; `--`
  takes them out of a week, and lines in the cell work as usual (`Wed 11:00`).
- **Note** lines are the day's banner — `Mon No school — Labor Day`.
- **Evening** lines go under *This evening* at the foot of the day —
  `Tue Robotics — 6:00pm https://…`.

Everything else, Reading included, is a task with a checkbox.

**Row order is the day's order.** A time is shown when there is one, but never
reorders anything. The time gutter is all-or-nothing per day, so the coloured
edges stay in line.

**Section dividers carry down**, setting the left-edge colour and the default
`Who` for the rows beneath: *Parent Led* → ochre and *Instructor/parent-led*,
*Self-Paced* → periwinkle and *Independent*, *Rituals* → navy, *Activities* →
plum. A row with only a name is only treated as a divider if its name reads
like one (*rituals, parent, self-paced, independent, activities, around*), so a
subject you haven't started using yet doesn't reset the section under it.

**No formatting reaches the page.** Published CSV is plain text, so
strikethrough, colour and bold in the Sheet are invisible here.

## Today

One day at a time, built from the plan tab's week column for that day. Every
weekday of every dated week is a school day; a Saturday or Sunday is a day
only when something lands on it (a `Sun` in `Days`, say). *‹ Prev day* and
*Next day ›* step through them, and *Today* comes back.

Each subject is one block. A subject with one task that day is the familiar
row — box, name, detail. A subject with several shows its name, then one
ticked line per task: carried tasks first, then that day's own, then one-offs,
then the ones she paces (*overdue* before *due Fri*). There is no separate
"this week" panel; the whole day is one list with the flexible parts marked.

### What happens when she ticks

**Ticking looks the same for every task.** It strikes through and stays exactly
where it is for the rest of that day. The difference is what happens next:

| kind | ticked | not ticked |
|---|---|---|
| daily | done for that day. Tomorrow starts clean | never carries — a missed fifteen minutes isn't thirty tomorrow |
| pinned | done | shows on the following school days tagged *carried from Tuesday* |
| `By Fri` | done for the week — gone from the days after | shows every school day; after its due day, tagged *overdue · was due Fri* |

**Carried and overdue stop after five school days.** Weekends and weeks off
don't count. After that it's gone from the day, though still in Supabase.

A tick saves straight away and shows on every signed-in device at the next
refresh. If it doesn't save, the box un-ticks itself and says why.

**Notes and skipping.** *note* on any task opens a line for how it went — this
is where *she flew through it* goes now, written on the day. The same panel has
*Skip it*, which stops a task carrying (or a `By` task showing) without
pretending it was done, and *Not skipped after all* to undo that.

**Something that isn't in the plan** — a field trip, the dentist, *finish
yesterday's lab* — goes in *Add something to today* at the foot of the day.
Choose a subject to put it under, or leave it on its own. A time, `@dad` and
`//` work here too. It has a box like anything else, stays on that day only,
and *Take it off the day* (under *note*) removes it.

A refresh never redraws the day while a note or one-off is being typed.

### Setting it up

In the Supabase project that already holds CNN 10, run `supabase/day.sql` in
the SQL editor. That's all — the sign-in is the same one.

`day_state` holds one row per task she has touched, keyed by the day (or, for a
`By` task, that week's Monday), the subject's name, and the task's own words
lowercased with everything but letters and digits removed. So adding a line
above a task changes nothing, but **rewording a task, or renaming a subject,
starts it afresh** — its old ticks and notes stay in the table, unread.
`done_on` is the day she ticked it, which is how a `By Fri` task knows to stay
struck through on Tuesday and be gone on Wednesday. `day_extra` holds the
one-offs.

For the weekly review, everything that got done is in `day_state` where
`done_at` is set.

### The old `daily` tab

Retired at a week boundary in September 2026. It stays in the Sheet as an archive until
the school year ends — unhooked, and not imported. It was never the
compliance record; the vault's `Log/` folder is.

## The `reading` tab

One row per book, with a heading row on top. The headings can sit in any
order, and extra columns are ignored:

| column | holds |
|---|---|
| `Title` | the book. Required — the heading row is found by looking for it |
| `Author/Source` | the author, or a link for an article or a podcast |
| `Started` | the date she opened it |
| `Finished` | the date she closed it |
| `Context` | the subject it counts toward — the outlined tag |
| `Type` | Book, Podcast, Article — the filled tag |

**The two date columns are the shelf.** There is no status column to keep in
step with reality:

| Started | Finished | shelf |
|---|---|---|
| a date | empty | **Reading now** |
| empty | empty | **To read** |
| — | a date | **Finished** |

So starting a book is typing a date in one cell, and finishing it is typing a
date in another. Each shelf is collapsible, with its count in the heading.
Reading now and To read open by default, Finished stays folded; whatever you
fold or unfold is remembered on that device. Reading now and Finished sort
newest first, To read keeps the Sheet's order — so it's a queue you arrange by
dragging rows.

A shelf with nothing on it still shows, folded, with a `0`. The left edge of
each book is coloured by its `Context`, using the same colours as the plan.

A link in any cell becomes a tappable link, same as on the plan tab.

## The `wins` tab

One row per thing she did — a certification, a competition, a performance, a
project, a milestone. Headings can sit in any order, and they're matched
loosely, so `Date ` with a trailing space and `Notes/ Results` with a slash
both land where you'd expect:

| column | holds |
|---|---|
| `What` | the accomplishment. Required — the heading row is found by looking for it |
| `Date` | when it happened. This is what buckets it into a year |
| `Type` | Certification, Competition, Performance, Project, Milestone — the tag |
| `Issuing/Awarding Body/Organization` | who gave it, ran it, or hosted it |
| `Notes/Results` | the detail line — a score, a placing, an expiry |
| `Evidence` | a share link, or the filename of the paperwork |

**Grouped by year, newest first**, each year collapsible with its count. The
current year opens itself; earlier years stay folded until asked for, and your
folding is remembered on that device. A row with no date waits under **No date
yet** at the bottom rather than being dropped.

**Evidence works two ways.** Paste a Drive or Dropbox share link and the page
shows *View evidence →*, tappable. Leave a bare filename and it shows quietly
as *On file: …* — you know the paperwork exists, and the page doesn't pretend
it can open something sitting in your own Drive. Swapping a filename for a
share link later is the only change needed to make it tappable.

## CNN 10

She watches CNN 10 every weekday morning. The view has three parts, top to
bottom:

- **Today's line** — the date, one story, why it stuck. Ungraded, a minute's
  work. One line per date: saving a date that already has a line updates it,
  and the button says *Update today's line* so there's no wondering whether it
  saved twice. Its job is that on report day there are five stories to choose
  from.
- **This week's report**, folded away — one story from the week's lines, in
  four steps: slug the story · five W's and an H · fact versus framing · so
  what. The week's lines are listed inside it. *Your take* counts sentences and
  turns navy at three. Name, slug, *What happened?* and *Your take* are needed
  before it can be turned in. A half-written report is kept on the device as
  she types, so a reload or a closed tab doesn't lose it.
- **Turned in** — every report, newest first, by school year. *Turned in* until
  it has feedback, then *Graded*, with the feedback and score on the card.

**A turned-in report can't be changed from the page.** There is no update
policy for reports. Grading happens in the Supabase dashboard: fill in `score`,
`feedback` and `graded_at` on the row, and the card flips to *Graded* within a
minute. Choosing a report as a portfolio piece is setting `selected_at` in the
same pass.

**Printing prints reports, as documents** — the answers without the form
around them, one report to a page. Open a report's answers and print, and only
that report prints; print with none open and they all do.

### Setting it up

1. Make a Supabase project. In its SQL editor, run `supabase/cnn10.sql`, then
   `supabase/day.sql`.
2. Under **Authentication**, switch **off** new sign-ups. The publishable key sits in
   `index.html` in a public repo, so with sign-ups on, anyone could make an
   account, open the page and read her work.
3. Add the one family account, by email and password.
4. Paste the project URL and the publishable key (Project Settings › API Keys)
   into the top of `index.html`, inside the quotes:

```js
const SB_URL = "https://xxxx.supabase.co";
const SB_KEY = "sb_publishable_...";   // never the secret key
```

Signing in once keeps that browser signed in, for the whole page.

### Filing into the vault

Supabase holds every report. The homeschool vault holds only the few chosen as
work samples, filed by `scripts/vault-sync.mjs` — a local script, because the
deployed page can't reach a folder on the Mac.

```bash
cd scripts && npm install
```

Then put `SB_URL` and `SB_SERVICE_KEY` (the secret key, `sb_secret_...`) in
`scripts/.env`, which git ignores, and run it by hand or from cron:

```bash
node --env-file=scripts/.env scripts/vault-sync.mjs
```

It files a report only once `selected_at` is set, and never twice:

- her answers, verbatim, to `Work Samples/` as
  `YYYY-MM-DD - Social Studies - CNN 10 - <slug>.md`, dated by the episode's
  air date — so a report needs an air date before it can be filed
- once there's feedback, a separate note in `Feedback/`, filled into the
  vault's own `_Templates/Assignment Feedback.md`. Start a line of feedback
  with *What's working:*, *What to correct:*, *Next step:* or *Parent notes:*
  and it lands under that heading; anything unlabelled goes under Parent
  notes, with the score

`vault_path` and `feedback_path` record what's been filed. It never edits a
filed work sample, never writes to `Log/`, `Student Log/` or the reading list,
never makes a folder and never deletes anything. It prints one line saying what
it filed, for the day's log.

## When a tab is missing or empty

Nothing ever shows a blank screen, and a problem with one tab never takes down
the others.

| situation | what happens |
|---|---|
| gid left as `""` | A calm dashed card in that view saying it isn't connected. |
| tab not published / 404 / HTML back instead of CSV | Red banner in that view naming the problem. Other views unaffected. |
| no connection, but this browser has seen it before | The last saved copy, with *saved copy* in the kicker and *No connection — showing the last saved copy* at the foot. |
| tab published but completely empty | Dashed card: published, but empty. Not an error. |
| `reading` has no `Title` column | Red banner naming the headings it wants. |
| `wins` has no `What` column | Red banner naming the headings it wants. |
| `plan` has no `Date` row | The Plan view works; Today shows a red banner saying it needs the Mondays. |
| a `Days` cell that isn't days (`MWF`) | A quiet line at the top of Today naming the row; that subject runs every school day until it's fixed. |
| no school day today | Today shows the nearest one ahead, and says so. The **Today** button returns to that day. |
| `plan` tab has no `Time`/`Who`/`Days` columns yet | Today still works: every subject every school day, times blank, who from its section. |
| `SB_URL` left as `""` | Every view shows a dashed card saying what to fill in. |
| signed out | Every view shows the sign-in card, and nothing else. |
| no connection, and this device was never signed in | A red banner with *Try again*. |
| no connection, signed in here before | The whole page carries on from saved copies. Ticks and notes say they didn't save, and why. |
| Supabase unreachable when stepping to a day it hasn't read | Today shows the day from the plan with its boxes locked, and a red banner saying ticks can't be checked. |
| Supabase unreachable inside CNN 10, no saved copy | Red banner inside CNN 10 only. |

The page re-checks the Sheet, and Supabase, every 60 seconds and updates on its own. Google
caches published CSVs for a few minutes, so an edit takes a moment to show up.
