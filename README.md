# School

One phone-first page, six views, no build step. Every view but one reads a
tab of the same Google Sheet, published to the web as CSV, so the Sheet stays
the only thing that ever gets edited. The exception is CNN 10, which is written
to, and so keeps its words in Supabase behind a sign-in.

| view | reads | state |
|---|---|---|
| **Today** (opens here) | `daily` tab | built |
| **Plan** — the week at a glance | `plan` tab | built |
| **Reading** — reading now / to read / finished | `reading` tab | built |
| **Wins** — accomplishments, by year | `wins` tab | built |
| **CNN 10** — daily line and weekly current-events report | Supabase, signed in | built |
| **Map** — subjects and credits to 12th grade | `map` tab | stub, and last in the tabs until it isn't |

Plain HTML/CSS/JS in `index.html`. No framework, no npm, and no accounts for
anyone viewing it — except `#cnn10`, which asks for the family sign-in and
nothing else does. Views are linkable: `#today`, `#plan`, `#reading`, `#wins`,
`#cnn10`, `#map` — the hashes are fixed, so tab order can change without breaking a
bookmark.

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
const GID = { plan: "0", daily: "123456", map: "", reading: "789012", wins: "345678" };
```

A tab left as `""` is simply not connected. Its view says so and the rest of
the page carries on.

## The `plan` tab

Read exactly as it already is — week-level, subjects down the left, weeks
across the top, section dividers in between. Nothing about its shape needs to
change. The page looks for:

- a row starting with **Week** in column A, week numbers running across it
- a row starting with **Date** (optional), the Monday of each week under it
- a row starting with **Subject** with **Source** beside it (optional)
- everything below that: one row per subject
- a row with a name but no source and no week cells = a **section divider**
- a blank column = a week off; `--` in a cell = nothing that week

Section names set the left-edge colour: *Rituals* navy, *Parent Led* ochre,
*Self-Paced* periwinkle. Trombone and STEM lab stay plum. Cells with line
breaks in them render as separate lines.

## The `daily` tab

The same shape as the plan tab, one step finer: subjects down the left, **one
column per school day** across the top, section dividers in between. Freeze
A:C and scroll right. `daily-template.csv` is the whole school year — every
date already filled in from the plan tab, week 2 worked through — ready to
paste straight in.

```
A: Subject | B: Time | C: Who | (Every, optional) | then one column per school day
```

The page looks for a row starting **Date** with a date under each school day,
and a row starting **Subject** with **Time** and **Who** beside it. Everything
below that is one row per subject. A row with a name but nothing else is a
section divider. Columns without a date are ignored, so you can leave gaps
between weeks.

Columns A–C are the skeleton — the subject, its usual time, and who leads.
Set them once. What changes daily goes in the day's cell:

| in a cell | means |
|---|---|
| `x ` at the front | done — struck through, dimmed, locked for everyone |
| `> ` at the front | carried on to the next day the sheet knows about |
| `-` or empty | nothing that day |
| `9:55 ` at the front | that day's time, overriding column B |
| `@dad` `@adult` `@own` | that day's who, overriding column C |
| `// …` at the end | your note about how it went |
| a pasted link | shown as a tappable link |
| `#cnn10` (or `#reading`, `#wins`, …) | a link to that tab, on the same page — `Write today's line #cnn10` shows *CNN 10 →* |

So `x 9:55 @dad Unit 1 practice set // she flew through it` is done, at 9:55,
with Dad, with a note. Everything left over is the detail line. A cell holding
only a time (`10:30`) sets the time and takes its text from the row name —
which is how Break and Lunch move around during the week.

`x-axis practice` is not mistaken for a done marker; the marker only counts
when a space or the end of the cell follows it.

Paste a meeting link straight into the cell — `Robotics — 6:30pm
https://meet.google.com/abc-defg-hij` — and the page turns it into a link she
can tap, protocol trimmed off the label so it stays short on a phone. The `//`
in `https://` is not read as a note marker, so a link and a note can sit in the
same cell.

**Things that happen every week go in an `Every` column** — an optional
column headed `Every`, between `Who` and the first date. Freeze A:D instead of
A:C. A cell there starts with the weekday and is otherwise an ordinary cell:

```
Trombone | | own | Sun 3:00pm @adult Lesson on Zoom https://zoom.us/j/…
```

That puts a Trombone lesson, at 3:00pm, with its link, on every Sunday from
the first date in the sheet to the last — Sundays included even though they
have no column of their own. `Mon/Wed`, `Tues & Thu` and `Sundays` all work.
Type it once; changing the link is changing one cell. The row's own day cells
carry on as normal, so the Trombone row can hold daily practice and the
Sunday lesson at once. If a dated day has its own cell for that row, the cell
wins, which is how one week says something different. Every-column items can't
be marked `x` or `>` ahead of time, and a Friday `>` still carries to Monday,
not to Sunday.

**Rows named `Break`, `Lunch`, `Note` or `Evening`** are treated specially —
the first two as grey pauses with no checkbox, the other two as the day's
banner and its evening line. Everything else, Reading included, is an ordinary
task with a checkbox.

**The sheet's row order is the day's order.** A time is shown when you give
one, but it never reorders anything — so if you want a break mid-morning, put
the `Break` row where it belongs in the list rather than at the bottom. The
time gutter is all-or-nothing per day: give one item a time and every row that
day gets the column, so the coloured edges stay in line.

**Section dividers carry down.** A row with a name and nothing else is a
divider, and it sets both the left-edge colour and the default `Who` for the
rows beneath it: *Parent Led* → ochre and *Instructor/parent-led*, *Self-Paced*
→ periwinkle and *Independent*, *Rituals* → navy, *Activities* → plum. Trombone
and STEM lab stay plum wherever you file them. So `Who` only needs filling in
where a row differs from its section.

A divider is only allowed to change the section if its name reads like one
(*rituals, parent, self-paced, independent, activities, around*). A subject row
you haven't started using yet looks identical to a divider — empty, with just a
name — so an unrecognised empty row is left alone rather than silently
resetting the section for everything under it.

Columns with nothing in them aren't treated as school days, so a year of
pre-filled dates costs nothing.

Her checkboxes are in memory only. They reset on reload and are never written
anywhere — not to the Sheet, not to the browser.

**No formatting reaches the page.** Published CSV is plain text and the
published-HTML view is a JavaScript shell with no content in it, so
strikethrough, colour and bold in the Sheet are invisible here. That is why
done is `x` and not a struck-through cell.

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

A link in any cell becomes a tappable link, same as on the daily tab.

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

1. Make a Supabase project. In its SQL editor, run `supabase/cnn10.sql`.
2. Under **Authentication**, switch **off** new sign-ups. The publishable key sits in
   `index.html` in a public repo, so with sign-ups on, anyone could make an
   account and read her work.
3. Add the one family account, by email and password.
4. Paste the project URL and the publishable key (Project Settings › API Keys)
   into the top of `index.html`, inside the quotes:

```js
const SB_URL = "https://xxxx.supabase.co";
const SB_KEY = "sb_publishable_...";   // never the secret key
```

Signing in once keeps that browser signed in. *Sign out* is at the foot of the
view, and signing out clears the saved copy from the device (a half-written
report stays — it's hers).

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
| gid left as `""` | A calm dashed card in that view saying it isn't connected, and for `daily`, the exact columns it wants. Today falls back to showing the week's plan. |
| tab not published / 404 / HTML back instead of CSV | Red banner in that view naming the problem. Today falls back to the week's plan. Other views unaffected. |
| no connection, but this browser has seen it before | The last saved copy, with *saved copy* in the kicker and *No connection — showing the last saved copy* at the foot. |
| tab published but completely empty | Dashed card: published, but empty. Not an error. |
| `reading` has no `Title` column | Red banner naming the headings it wants. |
| `wins` has no `What` column | Red banner naming the headings it wants. |
| no `Date` row found | Red banner saying so. If it spots the old one-row-per-item layout it says that specifically. |
| a `Date` row with no dates across it | Red banner saying so. |
| `daily` has days, but none for today | Today shows the nearest day it does have, and says so. The **Today** button returns to that day, not to an empty one. |
| `daily` has rows for today but the `plan` tab is broken | Today works. Colours fall back to a built-in list. |
| `SB_URL` left as `""` | CNN 10 shows a calm dashed card saying what to fill in. Every other view carries on. |
| signed out | CNN 10 shows a small sign-in card and no report data. No other view ever asks. |
| Supabase unreachable, no saved copy | Red banner inside CNN 10 only. |
| Supabase unreachable, signed in here before | The last saved copy, with *saved copy* in the kicker. Saving says it didn't, and why. |

The page re-checks the Sheet, and Supabase, every 60 seconds and updates on its own. Google
caches published CSVs for a few minutes, so an edit takes a moment to show up.
