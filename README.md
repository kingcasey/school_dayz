# School

One phone-first page, five views, no build step. Every view reads a tab of the
same Google Sheet, published to the web as CSV, so the Sheet stays the only
thing that ever gets edited.

| view | reads | state |
|---|---|---|
| **Today** (opens here) | `daily` tab | built |
| **Plan** — the week at a glance | `plan` tab | built |
| **Map** — subjects and credits to 12th grade | `map` tab | stub |
| **Reading** — reading now / to read / finished | `reading` tab | stub |
| **Wins** — accomplishments | `wins` tab | stub |

Plain HTML/CSS/JS in `index.html`. No framework, no npm, no accounts for
anyone viewing it. Views are linkable: `#today`, `#plan`, `#map`, `#reading`,
`#wins`.

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
const GID = { plan: "0", daily: "123456", map: "", reading: "", wins: "" };
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

Row 1 is the headings. Order doesn't matter, extra columns are ignored, and
only `date` and `subject` have to exist as columns. One row per thing, per day.
`daily-template.csv` is a filled-in week you can paste straight in.

| column | required | meaning |
|---|---|---|
| `date` | yes | `2026-09-08` or `9/8/2026`. Blank is only allowed on `note`, `evening` and `reading` rows, where it means *every day*. |
| `start` | no | `9:00`, `1:40`. Afternoon is assumed for 1–6 unless you write `am`. Blank = no time, sorts to the top. |
| `subject` | yes | The bold line, and the left-edge colour. Matches the plan tab's subject names where it can. |
| `detail` | no | The grey line under it — what to do that day. |
| `who` | no | `adult`, `dad`, or `own` (the default). Ochre tag, plum tag, plain tag. |
| `status` | no | blank, `done`, `carried`, or `skip`. See below. |
| `type` | no | blank = a block. `break` = grey italic pause, no checkbox. `note` = banner at the top of the day. `evening` = the evening line. `reading` = the grey standing bar. |
| `note` | no | Your own line about how it went. Renders in italic under the detail — it's on the page, not private. |

**status**

- blank — a normal block, with an empty checkbox
- `done` — pre-checked, struck through, dimmed, and locked, for everyone. This
  is the teaching record.
- `carried` — shows on its own day tagged *carried over*, and again on the next
  day the sheet knows about, tagged *carried from Monday*. To move it further
  than one day, change its `date`.
- `skip` — the row doesn't render at all

Her checkboxes are in memory only. They reset on reload and are never written
anywhere — not to the Sheet, not to the browser.

## When a tab is missing or empty

Nothing ever shows a blank screen, and a problem with one tab never takes down
the others.

| situation | what happens |
|---|---|
| gid left as `""` | A calm dashed card in that view saying it isn't connected, and for `daily`, the exact columns it wants. Today falls back to showing the week's plan. |
| tab not published / 404 / HTML back instead of CSV | Red banner in that view naming the problem. Today falls back to the week's plan. Other views unaffected. |
| no connection, but this browser has seen it before | The last saved copy, with *saved copy* in the kicker and *No connection — showing the last saved copy* at the foot. |
| tab published but completely empty | Dashed card: published, but empty. Not an error. |
| headings missing or misspelled | Red banner naming the missing headings. |
| a `date` that isn't a date | Red banner naming the row number and what it says. |
| `daily` has rows, but none for today | Today shows the nearest day it does have, and says so. |
| `daily` has rows for today but the `plan` tab is broken | Today works. Colours fall back to a built-in list. |

The page re-checks the Sheet every 60 seconds and updates on its own. Google
caches published CSVs for a few minutes, so an edit takes a moment to show up.
