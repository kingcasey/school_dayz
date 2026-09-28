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
   * the published `plan` and `reading` tabs of the Sheet — the same public
     CSVs the page reads — only to name ticks from before supabase/item_text.sql
     (below), and books saved without a title.

   Each item reads as the app shows it: the plan cell's words, with a link
   shown without its https:// and a view's #hash as its tab name ("CNN 10 →").
   Ticks from before item_text.sql stored only a squashed key ("day11"); for
   those the words are found again in the plan tab, in that subject's cell
   for that week, as the stretch of the line whose squashed form is the key —
   which is the label the app drew. One that can't be found (the cell has
   since changed) shows its key.

   What it touches in the vault: files in Planning/App Export/, and nothing
   else — it doesn't read the vault, and it creates only that one folder.

   scripts/.env holds SB_URL and SB_SERVICE_KEY, as for the other scripts.
   ========================================================================== */

import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir, access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EXPORT_DIR = "/Users/caseyking/Library/Mobile Documents/iCloud~md~obsidian/Documents/HomeSchool/Planning/App Export";
const TZ = "America/New_York";
const PLAN_NAMES = { ela: "ELA", history: "U.S. History" };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(HERE, "..", "index.html");     // where the Sheet's ids and the tab names live
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

/* --- labels, as the app shows them ------------------------------------- */
/* The page's own squashing: lowercase, letters and digits only. */
function itemKey(text){
  return String(text == null ? "" : text).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
}

/* The Sheet's ids and the tab names, read from the page so they can't drift. */
const pageSrc = await readFile(PAGE, "utf8");
const PUB_ID = (pageSrc.match(/const PUB_ID = "([^"]+)"/) || [])[1];
const GID = Object.fromEntries(["plan", "reading"].map(k =>
  [k, (pageSrc.match(new RegExp("\\b" + k + ":\\s*\"(\\d+)\"")) || [])[1]]));
const TAB_NAMES = Object.fromEntries([...pageSrc.matchAll(/\{id:"([a-z0-9]+)",\s*tab:"([^"]+)"/g)].map(m => [m[1], m[2]]));

/* What the app draws for a line's words: a link without its https:// or a
   trailing /, and a view's own #hash as that tab's name. */
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s<>"']*/gi;
function asShown(text){
  let s = String(text).replace(URL_RE, raw => {
    const t = raw.match(/[.,;:!?)]+$/), trail = t ? t[0] : "";
    const u = trail ? raw.slice(0, -trail.length) : raw;
    return u.replace(/^https?:\/\//i, "").replace(/\/$/, "") + trail;
  });
  s = s.replace(new RegExp("(^|[\\s(])#(" + Object.keys(TAB_NAMES).join("|") + ")\\b", "g"),
                (m, pre, id) => pre + TAB_NAMES[id] + " →");
  return s.replace(/\s+/g, " ").trim();
}

function parseCSV(text){
  const rows = []; let row = [], cell = "", q = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){
      if(c === '"'){ if(text[i + 1] === '"'){ cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if(c === '"') q = true;
    else if(c === ","){ row.push(cell); cell = ""; }
    else if(c === "\n"){ row.push(cell); rows.push(row); row = []; cell = ""; }
    else if(c !== "\r") cell += c;
  }
  if(cell !== "" || row.length){ row.push(cell); rows.push(row); }
  return rows;
}
const sheetCache = {};
async function sheet(name){
  if(!(name in sheetCache)){
    sheetCache[name] = (async () => {
      if(!PUB_ID || !GID[name]) return null;
      const r = await fetch("https://docs.google.com/spreadsheets/d/e/" + PUB_ID + "/pub?gid=" + GID[name] +
                            "&single=true&output=csv", { cache: "no-store" });
      if(!r.ok) throw new Error("the Sheet's " + name + " tab answered " + r.status);
      return parseCSV(await r.text());
    })();
  }
  return sheetCache[name];
}

/* Where in a line its key's words are: the stretch whose squashed form is the
   key, standing on its own (not "Day 1" inside "Day 11"). */
function findWords(line, key){
  const stream = [], at = [];
  for(let i = 0; i < line.length; i++){
    for(const ch of itemKey(line[i])){ stream.push(ch); at.push(i); }
  }
  const flat = stream.join(""), alnum = c => /[\p{L}\p{N}]/u.test(c || "");
  for(let p = flat.indexOf(key); p >= 0; p = flat.indexOf(key, p + 1)){
    let a = at[p], z = at[p + key.length - 1];
    if(alnum(line[a - 1]) || alnum(line[z + 1])) continue;
    // Brackets and quotes belong to the words: "HW 1E (Honors)", not "(Honors".
    while(a > 0 && /[(\["'“‘]/.test(line[a - 1])) a--;
    while(z + 1 < line.length && /[)\]"'”’.!?]/.test(line[z + 1])) z++;
    return line.slice(a, z + 1);
  }
  return null;
}

function mondayOf(day){
  const d = new Date(day + "T12:00:00Z"), back = (d.getUTCDay() + 6) % 7;
  return addDay(day, -back);
}
function sheetDate(s){
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(!m) return null;
  const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
  return y + "-" + String(m[1]).padStart(2, "0") + "-" + String(m[2]).padStart(2, "0");
}

/* A Today tick's words, found again in the plan tab: that subject's row, that
   week's cell first, then its other weeks, nearest first. */
async function planWords(subject, key, dayDate){
  const rows = await sheet("plan");
  if(!rows) return null;
  const dateRow = rows.find(r => /^date$/i.test((r[0] || "").trim())) || [];
  const row = rows.find(r => itemKey(r[0]) === itemKey(subject));
  if(!row) return null;
  if(itemKey(subject) === key) return subject;          // a task with no words of its own is its subject
  const want = mondayOf(dayDate);
  const cols = [];
  dateRow.forEach((v, i) => { const d = sheetDate(v); if(d) cols.push({ i, d }); });
  cols.sort((a, b) => Math.abs(Date.parse(a.d) - Date.parse(want)) - Math.abs(Date.parse(b.d) - Date.parse(want)));
  for(const { i } of cols){
    for(const line of String(row[i] || "").split("\n")){
      const w = findWords(line, key);
      if(w) return w;
    }
  }
  return null;
}

/* A book's title from the reading tab, by its key. */
async function bookTitle(bookKey){
  const rows = await sheet("reading");
  if(!rows) return null;
  const col = (rows[0] || []).findIndex(h => /^title$/i.test(h.trim()));
  const hit = col >= 0 ? rows.slice(1).find(r => itemKey(r[col]) === bookKey) : null;
  return hit ? hit[col].trim() : null;
}

/* --- reading one day ---------------------------------------------------- */
let sheetWarned = false;
async function must(q){ const { data, error } = await q; if(error) throw error; return data || []; }

async function readDay(day){
  const start = nyStart(day).toISOString(), end = nyStart(addDay(day, 1)).toISOString();

  // Today's ticks: counted on done_on; a row without one (none the page
  // writes) falls back to when it was ticked.
  const cols = "subject,item_key,item_text,done_at,done_on,day_date";
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

  // Words for the ticks that were saved without them. A Sheet that can't be
  // reached leaves those showing their key, and says so in the log.
  for(const t of ticks){
    if(t.item_text || /^x-/.test(t.item_key)) continue;
    try{ t.found = await planWords(t.subject, t.item_key, t.day_date); }
    catch(err){ if(!sheetWarned){ sheetWarned = true; log("couldn't read the Sheet —", err.message); } }
  }
  for(const p of pages){
    if(p.book_title) continue;
    try{ p.found = await bookTitle(p.book_key); }
    catch(err){ if(!sheetWarned){ sheetWarned = true; log("couldn't read the Sheet —", err.message); } }
  }

  return { ticks, extraText, plan, pages, cnn: { daily: daily.length > 0, reports: reports.length } };
}

/* --- writing it --------------------------------------------------------- */
function oneLine(s){ return String(s).replace(/\s+/g, " ").trim(); }

/* A one-off's words as the app shows them: its text less a leading time, an
   @who tag and a // note, the way the page reads a cell. */
function oneOffWords(text){
  if(text == null) return null;
  let s = String(text).trim().replace(/^(\d{1,2}:\d{2}\s*(?:am|pm)?)(\s+|$)/i, "");
  s = s.replace(/@(adult|own|dad|mom|me)\b/i, "").replace(/\s{2,}/g, " ").trim();
  for(let i = s.indexOf("//"); i >= 0; i = s.indexOf("//", i + 2)){
    if(i > 0 && s[i - 1] === ":") continue;
    s = s.slice(0, i).trim(); break;
  }
  return s;
}

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
    const words = t.item_text || t.found
      || (/^x-/.test(t.item_key) ? oneOffWords(r.extraText[t.item_key.slice(2)]) : null);
    add(t.subject || "One-offs", t.done_at,
        "- " + (words ? asShown(words) : t.item_key + " (words not found: the plan cell has changed since)") +
        " — ticked " + when(day, t.done_at));
  });
  r.plan.forEach(t => {
    const words = t.item_text ? asShown(t.item_text) : "(words not recorded)";
    add((PLAN_NAMES[t.plan] || t.plan) + " (lesson plan)", t.checked_at,
        "- Week " + t.week + ": " + words + " — ticked " + when(day, t.checked_at));
  });
  r.pages.forEach(p => {
    const n = p.before != null && p.page > p.before ? p.page - p.before : null;
    add("Pages read", p.updated_at, "- " + oneLine(p.book_title || p.found || p.book_key) + " — read to p. " + p.page +
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
