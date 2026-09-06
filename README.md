# School week

A single-page, phone-first view of one homeschool week. It reads the plan
straight from a Google Sheet (the **PLAN** tab, published to the web as CSV),
so the sheet is the only thing that ever needs updating.

- **No accounts, no app, no login** for anyone viewing it.
- Shows the current week automatically (by date), with prev/next arrows.
- Her checkboxes are session-only (reset on reload); the plan's own "taught"
  marks render pre-checked and struck through — that's the teaching record.
- Caches the last good copy in the browser, so it still opens with no signal.
- Polls the sheet every 60 seconds and updates on its own when it changes.

Plain HTML/CSS/JS. No build step, no framework, no dependencies.

## How it's wired

`index.html` holds everything. The only line that connects it to the data is
near the top of the script:

```js
const SHEET_CSV_URL = "...";   // the PLAN tab, published to the web as CSV
```

## Sheet format

The PLAN tab (or a flat helper tab published as CSV) must have these column
headings in row 1. Order doesn't matter; extra columns are ignored.

| column | required | meaning |
|---|---|---|
| `week` | yes | week number, 1–12 |
| `week_start` | yes | the Monday of that week, e.g. `2026-09-07` |
| `week_label` | no | human date shown under the title, e.g. `September 7–11, 2026` |
| `term` | no | e.g. `Term 1` |
| `daily_reading` | no | grey standing bar for the week |
| `week_note` | no | optional banner for the whole week |
| `day` | yes | `mon` `tue` `wed` `thu` `fri` |
| `day_note` | no | note at the top of that day |
| `evening` | no | evening activity line for that day |
| `time` | yes | e.g. `9:00` |
| `type` | no | `block` (default) or `pause` for breaks/lunch |
| `subject` | no | colour key: rituals, ela/english, history, grammar, lifeskills, math, science, asl, writing, vocab, trombone, stemlab |
| `name` | yes | what shows in bold, e.g. `English` |
| `detail` | no | the smaller description line |
| `who` | no | `adult`, `own` (default), or `dad` |
| `taught` | no | `TRUE` = already taught: pre-checked, struck, dimmed |

One row = one block, in schedule order top to bottom.

## If the sheet format breaks

The page never shows a blank screen. If the sheet is unreadable or the
headings are wrong, it keeps showing the last good copy (or a clear red
message naming the exact problem — which row, which column).
