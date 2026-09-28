#!/usr/bin/env node
/* ==========================================================================
   export-day — writes a school day's ticks into the vault, for the daily log.

     node scripts/export-day.mjs                          today (New York time)
     node scripts/export-day.mjs --date 2026-09-28        one day
     node scripts/export-day.mjs --from 2026-09-01 --to 2026-09-25
     node scripts/export-day.mjs --force                  replace an export that exists
     node scripts/export-day.mjs --scheduled              what the 6 PM agent runs (below)

   One file per day, Planning/App Export/YYYY-MM-DD.md: frontmatter, then a
   section per subject listing what was ticked that day — the item as it read,
   and the time. Something ticked and then unticked has no tick left, so it
   isn't there; an export is the tables as they stand when it runs. A weekday
   with nothing ticked still gets its file, saying so; a Saturday or Sunday
   gets one only if something was ticked (or it was asked for by --date). An
   existing export is never replaced without --force.

   --scheduled, run by the agent each weekday at 6 PM: writes every weekday of
   the last two weeks that has no file yet, then today if it's a weekday and
   past 6 PM. So a Mac that was asleep or away catches up on its next run,
   and a day already written is never touched.

   What it reads, and nothing else:
   * day_state — Today's ticks (done_at set), counted on done_on, the school
     day they were ticked; and day_extra, for a one-off's text
   * plan_progress — #ela and #history ticks, counted on checked_at
   * reading_page — the page she read to, per book
   * cnn10_daily_log and cnn10_reports — only whether one exists for the day:
     log_date, and a report's id and created_at. Never a word of either.
   Items ticked before supabase/item_text.sql have no words stored; they show
   as their key.

   What it touches in the vault: files in Planning/App Export/, and nothing
   else — it doesn't read the vault, and it creates only that one folder.

   scripts/.env holds SB_URL and SB_SERVICE_KEY, as for the other scripts.
   ========================================================================== */

import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EXPORT_DIR = "/Users/caseyking/Library/Mobile Documents/iCloud~md~obsidian/Documents/HomeSchool/Planning/App Export";
const TZ = "America/New_York";
const PLAN_NAMES = { ela: "ELA", history: "U.S. History" };

const HERE = path.dirname(fileURLToPath(import.meta.url));
function log(...a){ console.log(new Date().toISOString(), ...a); }

try{ process.loadEnvFile(path.join(HERE, ".env")); }
catch(err){ if(err.code!=="ENOENT") throw err; }
const { SB_URL, SB_SERVICE_KEY } = process.env;
if(!SB_URL || !SB_SERVICE_KEY){
  log("SB_URL and SB_SERVICE_KEY are needed, in scripts/.env. Stopping.");
  process.exit(1);
}
const sb = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } });

/* --- New York dates and times ------------------------------------------- */
function nyParts(d){
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short" }).formatToParts(d).map(x => [x.type, x.value]));
  return p;
}
function nyDate(d){ const p = nyParts(d); return p.year + "-" + p.month + "-" + p.day; }
/* Minutes New York is ahead of UTC at that instant (negative: behind). */
function nyOffset(d){
  const p = nyParts(d);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}
/* The instant a New York calendar day starts. */
function nyStart(day){
  const [y, m, d] = day.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - nyOffset(new Date(guess.getTime() - nyOffset(guess) * 60000)) * 60000);
}
function addDay(day, n){
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function nyTime(iso){
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function nyStamp(d){
  const p = nyParts(d), off = nyOffset(d), a = Math.abs(off);
  return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute + ":" + p.second +
    (off < 0 ? "-" : "+") + String(Math.floor(a / 60)).padStart(2, "0") + ":" + String(a % 60).padStart(2, "0");
}

/* --- which days --------------------------------------------------------- */
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const force = argv.includes("--force");
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

let days;
const isWeekend = day => [0, 6].includes(new Date(day + "T12:00:00Z").getUTCDay());
const CATCH_UP_DAYS = 14;     // how far back a scheduled run fills in missing weekdays
const DAY_ENDS_AT   = 18;     // a scheduled run writes today only from 6 PM

if(argv.includes("--scheduled")){
  const now = new Date(), today = nyDate(now);
  days = [];
  for(let d = addDay(today, -CATCH_UP_DAYS); d < today; d = addDay(d, 1)) if(!isWeekend(d)) days.push(d);
  if(!isWeekend(today) && +nyParts(now).hour >= DAY_ENDS_AT) days.push(today);
} else if(opt("--from") || opt("--to")){
  const from = opt("--from"), to = opt("--to");
  if(!DAY_RE.test(from || "") || !DAY_RE.test(to || "") || from > to){
    log("--from and --to need two dates, YYYY-MM-DD, in order."); process.exit(2);
  }
  days = [];
  for(let d = from; d <= to; d = addDay(d, 1)) days.push(d);
  if(days.length > 400){ log("That's more than 400 days; pick a shorter range."); process.exit(2); }
} else if(opt("--date")){
  if(!DAY_RE.test(opt("--date"))){ log("--date needs YYYY-MM-DD."); process.exit(2); }
  days = [opt("--date")];
} else days = [nyDate(new Date())];

/* --- reading one day ---------------------------------------------------- */
async function must(q){ const { data, error } = await q; if(error) throw error; return data || []; }

async function readDay(day){
  const start = nyStart(day).toISOString(), end = nyStart(addDay(day, 1)).toISOString();

  // Today's ticks: counted on done_on; a row without one (none the page
  // writes) falls back to when it was ticked.
  const cols = "subject,item_key,item_text,done_at,done_on";
  const [onDay, undated] = await Promise.all([
    must(sb.from("day_state").select(cols).not("done_at", "is", null).eq("done_on", day)),
    must(sb.from("day_state").select(cols).not("done_at", "is", null).is("done_on", null)
      .gte("done_at", start).lt("done_at", end)),
  ]);
  const ticks = onDay.concat(undated);

  // A one-off's words are its day_extra text.
  const extraIds = ticks.filter(r => !r.item_text && /^x-/.test(r.item_key)).map(r => r.item_key.slice(2));
  const extras = extraIds.length
    ? await must(sb.from("day_extra").select("id,text").in("id", extraIds)) : [];
  const extraText = Object.fromEntries(extras.map(x => [x.id, x.text]));

  const plan = await must(sb.from("plan_progress").select("plan,week,item_key,item_text,checked_at")
    .not("checked_at", "is", null).gte("checked_at", start).lt("checked_at", end));

  // Pages: the page reached today, and the last one before it, for how many.
  const pages = await must(sb.from("reading_page").select("book_key,book_title,page,updated_at").eq("day_date", day));
  for(const r of pages){
    const prev = await must(sb.from("reading_page").select("page").eq("book_key", r.book_key)
      .lt("day_date", day).order("day_date", { ascending: false }).limit(1));
    r.before = prev.length ? prev[0].page : null;
  }

  // CNN 10: whether, never what.
  const [daily, reports] = await Promise.all([
    must(sb.from("cnn10_daily_log").select("log_date").eq("log_date", day)),
    must(sb.from("cnn10_reports").select("id,created_at").gte("created_at", start).lt("created_at", end)),
  ]);

  return { ticks, extraText, plan, pages, cnn: { daily: daily.length > 0, reports: reports.length } };
}

/* --- writing it --------------------------------------------------------- */
function oneLine(s){ return String(s).replace(/\s+/g, " ").trim(); }

/* When it was ticked. A tick counts on the school day it was ticked for,
   which isn't always the day it was ticked — Monday's work ticked on Tuesday
   morning, or a day ticked ahead — so then the date is given too. */
function when(day, iso){
  if(nyDate(new Date(iso)) === day) return nyTime(iso);
  const d = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })
    .format(new Date(iso));
  return d + ", " + nyTime(iso);
}

function render(day, r){
  const sections = new Map();       // subject -> [{at, line}]
  const add = (subject, at, line) => {
    if(!sections.has(subject)) sections.set(subject, []);
    sections.get(subject).push({ at, line });
  };

  r.ticks.forEach(t => {
    const words = t.item_text
      || (/^x-/.test(t.item_key) ? r.extraText[t.item_key.slice(2)] : null)
      || t.item_key + " (words not recorded)";
    add(t.subject || "One-offs", t.done_at, "- " + oneLine(words) + " — ticked " + when(day, t.done_at));
  });
  r.plan.forEach(t => {
    const words = t.item_text || "(words not recorded)";
    add((PLAN_NAMES[t.plan] || t.plan) + " (lesson plan)", t.checked_at,
        "- Week " + t.week + ": " + oneLine(words) + " — ticked " + when(day, t.checked_at));
  });
  r.pages.forEach(p => {
    const n = p.before != null && p.page > p.before ? p.page - p.before : null;
    add("Pages read", p.updated_at, "- " + oneLine(p.book_title || p.book_key) + " — read to p. " + p.page +
        (n ? " (" + n + (n === 1 ? " page" : " pages") + ")" : "") + " — saved " + when(day, p.updated_at));
  });
  const cnnLines = [];
  if(r.cnn.daily) cnnLines.push("- Daily entry written");
  if(r.cnn.reports) cnnLines.push("- Weekly report turned in" + (r.cnn.reports > 1 ? " (" + r.cnn.reports + ")" : ""));

  // Subjects in the order their first tick came.
  const order = [...sections.entries()].map(([name, list]) => {
    list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return { name, list, first: list[0].at };
  }).sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));

  // CNN 10's status joins a CNN 10 subject if the day has one, or stands alone.
  const cnnHome = cnnLines.length ? order.find(s => /cnn\s*10/i.test(s.name)) : null;

  const out = ["---", "date: " + day, "generated_at: " + nyStamp(new Date()), "---", "",
               "# App export — " + day, ""];
  if(!order.length && !cnnLines.length){
    out.push("Nothing was ticked in the app on this day.", "");
  }
  order.forEach(s => {
    out.push("## " + s.name, "", ...s.list.map(x => x.line));
    if(s === cnnHome) out.push(...cnnLines);
    out.push("");
  });
  if(cnnLines.length && !cnnHome) out.push("## CNN 10", "", ...cnnLines, "");
  return out.join("\n");
}

/* --- run ---------------------------------------------------------------- */
try{ await access(EXPORT_DIR); }
catch{ await mkdir(EXPORT_DIR); log("made", EXPORT_DIR); }   // App Export only; Planning must already exist

let failed = 0;
for(const day of days){
  const file = path.join(EXPORT_DIR, day + ".md");
  if(!force){
    const exists = await access(file).then(() => true, () => false);
    if(exists){
      // A scheduled run looks at two weeks each time; saying so for every
      // day already written would bury the log.
      if(!argv.includes("--scheduled")) log(day + ": already exported, left as it is (--force to replace)");
      continue;
    }
  }
  try{
    const r = await readDay(day);
    const empty = !r.ticks.length && !r.plan.length && !r.pages.length && !r.cnn.daily && !r.cnn.reports;
    if(empty && isWeekend(day) && !opt("--date")){ log(day + ": weekend, nothing ticked, no file"); continue; }
    const body = render(day, r);
    await writeFile(file, body, { flag: force ? "w" : "wx" });
    log(day + ": wrote " + path.basename(file));
  }catch(err){
    failed++;
    log(day + ": failed —", err && (err.message || err));
  }
}
process.exit(failed ? 1 : 0);
