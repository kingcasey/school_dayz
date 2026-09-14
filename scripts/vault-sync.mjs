#!/usr/bin/env node
/* ==========================================================================
   vault-sync — files selected CNN 10 reports into the homeschool vault.

   The deployed page can't reach a folder on this Mac, so this runs here, by
   hand or from cron:

     cd scripts && npm install          (once)
     node --env-file=scripts/.env scripts/vault-sync.mjs

   scripts/.env holds SB_URL and SB_SERVICE_KEY — the secret key (sb_secret_…), since
   recording where a report was filed is an update the page itself is never
   allowed to make. Keep that file out of git; it is ignored already.

   The vault's own CLAUDE.md governs what this may do, and it is narrow:

   * Only reports marked selected in Supabase are filed. The rest stay in
     Supabase, which is the complete record; the vault holds the few that
     show growth, so they don't bury every other subject.
   * Two files per report, never one. Her work goes in Work Samples/, the
     feedback on it in Feedback/. Keeping them apart is the point.
   * Work Samples/ is written once and never edited — not even to add
     feedback, which is why feedback is a file of its own.
   * Nothing else in the vault is touched: not Log/, not Student Log/, not
     Reading List.md. No folder is created and nothing is deleted.

   vault_path and feedback_path are what make a second run file nothing.
   ========================================================================== */

import { createClient } from "@supabase/supabase-js";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/* Where the vault lives. It's an iCloud folder, so a file written here can take
   a moment to show up on other devices — that's iCloud, not a failure, and
   nothing here retries around it. */
const VAULT = "/Users/caseyking/Library/Mobile Documents/iCloud~md~obsidian/Documents/HomeSchool";

/* The student's folder under Students/. Left empty, it is found by looking —
   there is one — which also keeps the folder's name out of this repo. */
const STUDENT = "";

const SUBJECT  = "Social Studies";     // current events is Social Studies work product
const STRAND   = "Current Events";
const SOURCE   = "CNN 10";
const TEMPLATE = "_Templates/Assignment Feedback.md";

/* The report's questions, in the order and words the page asks them. */
const QUESTIONS = [
  ["slug",    "Story slug"],
  ["who",     "Who is involved?"],
  ["what",    "What happened?"],
  ["where_",  "Where did it take place?"],
  ["when_",   "When did it happen?"],
  ["why",     "Why did it happen?"],
  ["how",     "How does it affect people beyond the people in the story?"],
  ["fact",    "One solid fact"],
  ["framing", "One piece of framing you noticed"],
  ["matters", "Why should anyone outside that story care?"],
  ["voice",   "Your take"],
];

/* The template's four headings, and the labels that route a line of feedback
   under one of them. Feedback with no labels is the parent's own words, so it
   goes under Parent notes rather than being guessed into the others. */
const SECTIONS = [
  ["What's working",      /^(?:#+\s*)?what['’]?s working\b\s*[:\-—]?\s*/i],
  ["What to correct",     /^(?:#+\s*)?what to correct\b\s*[:\-—]?\s*/i],
  ["Suggested next step", /^(?:#+\s*)?(?:suggested )?next step\b\s*[:\-—]?\s*/i],
  ["Parent notes",        /^(?:#+\s*)?parent notes\b\s*[:\-—]?\s*/i],
];

function fail(message){
  console.error("vault-sync: " + message);
  process.exit(1);
}

async function isDir(p){
  try{ return (await stat(p)).isDirectory(); }catch(_){ return false; }
}

const blank = s => s == null || String(s).trim() === "";

function localIso(d){
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
         String(d.getDate()).padStart(2, "0");
}

/* August to July, named the way the vault names its year folders. */
function yearFolder(isoDate){
  const [y, m] = isoDate.split("-").map(Number);
  const start = m >= 8 ? y : y - 1;
  return start + "-" + (start + 1);
}

/* A slug is her words, but a filename has rules: no path separators, nothing
   Obsidian reads as link syntax, no trailing dots. */
function fileSafe(s){
  return String(s).replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/[. ]+$/, "").slice(0, 80) || "untitled";
}

/* Writes a file only if nothing is there. If something is, and it's exactly
   what would have been written, an earlier run got as far as the file but not
   as far as recording it — that's safe to record now. Anything else is left
   alone for a person to look at. */
async function writeOnce(file, content){
  try{
    await writeFile(file, content, { flag: "wx" });
    return "written";
  }catch(err){
    if(err.code !== "EEXIST") throw err;
    return (await readFile(file, "utf8")) === content ? "already" : "conflict";
  }
}

/* --- the work sample ---------------------------------------------------- */
function workSample(r, student){
  const lines = [
    "---",
    "date: " + localIso(new Date(r.created_at)),
    "student: " + student,
    "subject: " + SUBJECT,
    "strand: " + STRAND,
    "type: student-written",
    "source: " + SOURCE,
    "air_date: " + r.air_date,
    "---",
    "",
    "# " + SOURCE + " — " + String(r.slug).replace(/\s+/g, " ").trim(),
    "",
    "- **Name:** " + (r.student_name ?? ""),
    "- **Air date of episode:** " + r.air_date,
    "- **Week of:** " + (r.week_of ?? ""),
    "- **Turned in:** " + localIso(new Date(r.created_at)),
  ];
  // Her answers exactly as she wrote them — spelling and grammar included.
  for(const [key, label] of QUESTIONS){
    lines.push("", "## " + label, "");
    if(!blank(r[key])) lines.push(String(r[key]));
  }
  return lines.join("\n") + "\n";
}

/* --- the feedback, filled into the vault's own template ----------------- */
function splitFeedback(text){
  const out = Object.fromEntries(SECTIONS.map(([h]) => [h, []]));
  let at = "Parent notes";
  for(const line of String(text).split(/\r?\n/)){
    const hit = SECTIONS.find(([, re]) => re.test(line.trim()));
    if(hit){
      at = hit[0];
      const rest = line.trim().replace(hit[1], "");
      if(rest) out[at].push(rest);
    } else out[at].push(line);
  }
  for(const h in out){
    while(out[h].length && blank(out[h][0])) out[h].shift();
    while(out[h].length && blank(out[h][out[h].length - 1])) out[h].pop();
  }
  return out;
}

function feedbackNote(template, r, student, sampleName){
  const date = localIso(r.graded_at ? new Date(r.graded_at) : new Date());
  const parts = splitFeedback(r.feedback);
  if(!blank(r.score)){
    const notes = parts["Parent notes"];
    notes.unshift("Score: " + String(r.score).trim(), ...(notes.length ? [""] : []));
  }

  const lines = template.replace(/\r\n/g, "\n").split("\n");
  const seen = new Set();
  let fence = 0, section = null, inComment = false;
  const out = [];

  for(const line of lines){
    if(line.trim() === "---" && fence < 2){ fence++; out.push(line); continue; }

    if(fence === 1){
      const key = (line.match(/^(\w+):/) || [])[1];
      seen.add(key);
      if(key === "date")        out.push("date: " + date);
      else if(key === "student") out.push("student: " + student);
      else if(key === "subject") out.push("subject: " + SUBJECT);
      else if(key === "work_sample") out.push('work_sample: "' + sampleName + '"');
      else out.push(line);
      continue;
    }

    if(/^# /.test(line)){
      out.push(line.replace("[Assignment]", SOURCE + ": " + String(r.slug).replace(/\s+/g, " ").trim())
                   .replace("[YYYY-MM-DD]", date));
      continue;
    }

    const h = line.match(/^## (.+)$/);
    if(h){ section = h[1].trim(); seen.add("## " + section); out.push(line); continue; }

    if(section && line.includes("<!--")) inComment = true;
    if(inComment){
      out.push(line);
      if(line.includes("-->")){
        inComment = false;
        // Parent notes has no bullet to fill, so its words go after the comment.
        if(section === "Parent notes" && parts[section]?.length) out.push("", ...parts[section]);
      }
      continue;
    }

    // The template's bullet gets the feedback, still as a bullet.
    if(section && line.trim() === "-" && parts[section]?.length){
      const [first, ...rest] = parts[section];
      out.push(/^\s*[-*]\s/.test(first) ? first : "- " + first, ...rest);
      continue;
    }
    out.push(line);
  }

  // If the template has been changed, stop rather than fill in something else.
  const want = ["date", "student", "subject", "work_sample", "type",
                ...SECTIONS.map(([h]) => "## " + h)];
  const missing = want.filter(k => !seen.has(k));
  if(missing.length || !template.includes("ai-generated-commentary") || !template.includes("1002.41"))
    fail(TEMPLATE + " no longer looks the way this script expects" +
         (missing.length ? " (missing: " + missing.join(", ") + ")" : "") +
         ". Nothing was filed; update the script to match the template.");

  return out.join("\n").replace(/\n*$/, "\n");
}

/* --- run ---------------------------------------------------------------- */
async function main(){
  if(!VAULT) fail("VAULT is empty. Set it at the top of this script.");
  if(!(await isDir(VAULT))) fail("the vault isn't at " + VAULT + ". Check the VAULT constant.");

  const url = process.env.SB_URL, key = process.env.SB_SERVICE_KEY;
  if(!url || !key) fail("SB_URL and SB_SERVICE_KEY must be set — see the top of this script.");

  let student = STUDENT;
  if(!student){
    const found = [];
    for(const name of await readdir(path.join(VAULT, "Students")).catch(() => [])){
      if(!name.startsWith(".") && await isDir(path.join(VAULT, "Students", name))) found.push(name);
    }
    if(found.length !== 1)
      fail("expected one student folder under Students/, found " + found.length +
           ". Set STUDENT at the top of this script.");
    student = found[0];
  }

  const template = await readFile(path.join(VAULT, TEMPLATE), "utf8")
    .catch(() => fail("can't read " + TEMPLATE + " in the vault."));

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const filed = [], fed = [], notes = [];

  // 1. Selected, not yet filed: the work sample.
  const pending = await sb.from("cnn10_reports").select("*")
    .not("selected_at", "is", null).is("vault_path", null)
    .order("air_date", { ascending: true });
  if(pending.error) fail("couldn't read reports: " + pending.error.message);

  for(const r of pending.data){
    if(!r.air_date){
      notes.push('skipped "' + r.slug + '": it has no air date, and the filename is dated by it.');
      continue;
    }
    const rel = path.join("Students", student, yearFolder(r.air_date), "Work Samples");
    if(!(await isDir(path.join(VAULT, rel)))){
      notes.push('skipped "' + r.slug + '": ' + rel + " doesn't exist, and this script doesn't make folders.");
      continue;
    }
    const name = r.air_date + " - " + SUBJECT + " - " + SOURCE + " - " + fileSafe(r.slug) + ".md";
    const got = await writeOnce(path.join(VAULT, rel, name), workSample(r, student));
    if(got === "conflict"){
      notes.push('skipped "' + r.slug + '": ' + path.join(rel, name) + " already exists with other content. Left untouched.");
      continue;
    }
    const upd = await sb.from("cnn10_reports").update({ vault_path: path.join(rel, name) })
      .eq("id", r.id).is("vault_path", null);
    if(upd.error){
      notes.push('filed "' + r.slug + '" but couldn\'t record it (' + upd.error.message + "). The next run will.");
      continue;
    }
    filed.push(r);
  }

  // 2. Filed, graded, feedback not yet written: the feedback note.
  const graded = await sb.from("cnn10_reports").select("*")
    .not("selected_at", "is", null).not("vault_path", "is", null)
    .is("feedback_path", null).not("feedback", "is", null)
    .order("air_date", { ascending: true });
  if(graded.error) fail("couldn't read graded reports: " + graded.error.message);

  for(const r of graded.data){
    if(blank(r.feedback)) continue;
    const sampleName = path.basename(r.vault_path);
    const rel = path.join(path.dirname(path.dirname(r.vault_path)), "Feedback");
    if(!(await isDir(path.join(VAULT, rel)))){
      notes.push('no feedback filed for "' + r.slug + '": ' + rel + " doesn't exist, and this script doesn't make folders.");
      continue;
    }
    const name = sampleName.replace(/\.md$/, "") + " - Feedback.md";
    const got = await writeOnce(path.join(VAULT, rel, name), feedbackNote(template, r, student, sampleName));
    if(got === "conflict"){
      notes.push('no feedback filed for "' + r.slug + '": ' + path.join(rel, name) + " already exists with other content. Left untouched.");
      continue;
    }
    const upd = await sb.from("cnn10_reports").update({ feedback_path: path.join(rel, name) })
      .eq("id", r.id).is("feedback_path", null);
    if(upd.error){
      notes.push('wrote feedback for "' + r.slug + '" but couldn\'t record it (' + upd.error.message + "). The next run will.");
      continue;
    }
    fed.push(r);
  }

  notes.forEach(n => console.log("vault-sync: " + n));

  // One line, for the day's log — which this script never writes itself.
  if(!filed.length && !fed.length){ console.log("Nothing new to file."); return; }
  const said = [];
  if(filed.length) said.push("filed " + filed.length + " CNN 10 work sample" + (filed.length > 1 ? "s" : "") +
    " under " + SUBJECT + " (" + filed.map(r => '"' + r.slug + '", aired ' + r.air_date).join("; ") + ")");
  if(fed.length) said.push("filed feedback on " + fed.map(r => '"' + r.slug + '"').join(", "));
  console.log(said.join(" and ").replace(/^./, c => c.toUpperCase()) + ".");
}

main().catch(err => fail(err && err.stack || String(err)));
