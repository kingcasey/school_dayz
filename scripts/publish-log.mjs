#!/usr/bin/env node
/* ==========================================================================
   publish-log — copies her log notes into Supabase for the #log view.

   The vault's Log folder is the official record, and the page can't reach a
   folder on this Mac, so this watches that folder and puts each note into the
   daily_log table whenever it changes. The page only ever reads it; nothing
   here writes to the vault. See supabase/log.sql.

   It runs at login as a launchd agent (scripts/launchd/, and the README). By hand:

     cd scripts && npm install          (once)
     node scripts/publish-log.mjs              watch, and upload on change
     node scripts/publish-log.mjs --once       bring the table in line now, and stop

   scripts/.env (gitignored) holds, besides SB_URL and SB_SERVICE_KEY:
     LOG_DIR       the Log folder. Kept out of this file because its path has
                   her name in it, and this repo is public.
     REDACT_NAMES  comma-separated names to show as "B" — her first name, and
                   any fuller form of it. Replaced, whole words, any case,
                   before upload, so her name never reaches Supabase. Required:
                   it refuses to start without it rather than upload a note
                   with her name in.

   What it reads: the names in LOG_DIR (no other folder, nothing below it),
   and only the files whose names are a log note's:
     YYYY-MM-DD.md        a day     (the daily notes, to 2026-10-02)
     YYYY-MM-DD week.md   a week    (from 2026-10-05, dated by its Monday)
   Anything else there is never opened.

   What goes up, per note: the file name, day or week, its date, its status
   (partial or complete, from the frontmatter — nothing else of the
   frontmatter goes), the body with names replaced, a hash, and the file's
   modified time. A note deleted or renamed in the vault is deleted from the
   table too, so the copy never holds what the record doesn't — except that a
   folder that lists no notes at all is taken for iCloud having a moment, not
   for every note being gone, and nothing is deleted.
   ========================================================================== */

import { createClient } from "@supabase/supabase-js";
import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TABLE = "daily_log";
const DAY_RE  = /^(\d{4}-\d{2}-\d{2})\.md$/;
const WEEK_RE = /^(\d{4}-\d{2}-\d{2}) week\.md$/;

const POLL_MS   = 2000;    // how often to look at the folder
const SETTLE_MS = 5000;    // iCloud and the log task write in bursts: wait this long after the last change
const RETRY_MS  = 60000;   // after a failed upload, wait this long before trying that note again

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ONCE = process.argv.includes("--once");

function log(...a){ console.log(new Date().toISOString(), ...a); }

try{ process.loadEnvFile(path.join(HERE, ".env")); }
catch(err){
  if(err.code!=="ENOENT") throw err;       // no .env is fine if the variables are set some other way
}
const { SB_URL, SB_SERVICE_KEY, LOG_DIR, REDACT_NAMES } = process.env;
for(const [k, v] of Object.entries({ SB_URL, SB_SERVICE_KEY, LOG_DIR, REDACT_NAMES })){
  if(!v || !v.trim()){ log(k + " is needed, in scripts/.env. Stopping."); process.exit(1); }
}

/* Longest first, so "First Last" goes before "First" can split it. */
const NAMES = REDACT_NAMES.split(",").map(s => s.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAME_RE = new RegExp("(?<![\\p{L}\\p{N}])(?:" + NAMES.map(escapeRe).join("|") + ")(?![\\p{L}\\p{N}])", "giu");

const sb = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } });

function kindOf(name){
  let m = DAY_RE.exec(name);
  if(m) return { kind: "day", date: m[1] };
  m = WEEK_RE.exec(name);
  if(m) return { kind: "week", date: m[1] };
  return null;
}

/* iCloud can swap a file it has offloaded for ".name.icloud". That note is
   still in the vault, just not on this disk right now: not a deletion. */
function offloadedName(name){
  const m = /^\.(.+)\.icloud$/.exec(name);
  return m && kindOf(m[1]) ? m[1] : null;
}

/* The frontmatter is dropped whole; only its status is kept. */
function parse(text){
  let body = text.replace(/^﻿/, ""), status = null;
  const fm = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(body);
  if(fm){
    const s = /^status:\s*["']?([A-Za-z]+)["']?\s*$/m.exec(fm[1]);
    if(s && /^(partial|complete)$/i.test(s[1])) status = s[1].toLowerCase();
    body = body.slice(fm[0].length);
  }
  return { status, body: body.replace(NAME_RE, "B") };
}

/* What the table holds, as far as this run knows: file -> sha. */
const synced = new Map();
/* Notes seen to change (or go) and not yet dealt with: file -> when last seen changing. */
const due = new Map();
const retryAt = new Map();
const lastMtime = new Map();

async function listFolder(){
  const names = await readdir(LOG_DIR);
  const notes = new Map(), offloaded = new Set();
  for(const name of names){
    if(kindOf(name)){
      try{ notes.set(name, (await stat(path.join(LOG_DIR, name))).mtimeMs); }
      catch(err){ if(err.code !== "ENOENT") throw err; }      // gone between the list and the look
    } else {
      const o = offloadedName(name);
      if(o) offloaded.add(o);
    }
  }
  return { notes, offloaded };
}

async function upload(name){
  const full = path.join(LOG_DIR, name);
  const [raw, st] = await Promise.all([readFile(full, "utf8"), stat(full)]);
  // The names are part of the hash, so changing REDACT_NAMES sends everything again.
  const sha = createHash("sha256").update(NAMES.join("\n") + "\n\0" + raw).digest("hex");
  if(synced.get(name) === sha) return false;
  const { kind, date } = kindOf(name);
  const { status, body } = parse(raw);
  const { error } = await sb.from(TABLE).upsert({
    file: name, kind, log_date: date, status, body, sha, updated_at: new Date(st.mtimeMs).toISOString(),
  }, { onConflict: "file" });
  if(error) throw error;
  synced.set(name, sha);
  log(name + ": uploaded" + (status ? " (" + status + ")" : ""));
  return true;
}

async function remove(name){
  const { error } = await sb.from(TABLE).delete().eq("file", name);
  if(error) throw error;
  synced.delete(name);
  log(name + ": no longer in the vault, removed");
}

let listing = null;   // the last good listing

async function tick(){
  try{
    listing = await listFolder();
  }catch(err){
    log("can't list the Log folder (" + (err.code || err.message) + "), trying again");
    return;
  }
  const { notes, offloaded } = listing;
  const now = Date.now();
  for(const [name, m] of notes){
    if(lastMtime.get(name) !== m){ lastMtime.set(name, m); due.set(name, now); }
  }
  for(const name of synced.keys()){
    if(!notes.has(name) && !offloaded.has(name) && !due.has(name)) due.set(name, now);
  }
  for(const name of lastMtime.keys()) if(!notes.has(name)) lastMtime.delete(name);

  for(const [name, seen] of [...due]){
    if(now - seen < SETTLE_MS) continue;
    if((retryAt.get(name) || 0) > now) continue;
    try{
      if(notes.has(name)) await upload(name);
      else if(offloaded.has(name)) {}                       // still there, only offloaded
      else if(notes.size === 0){ log(name + ": folder lists no notes at all, so not removing anything"); continue; }
      else if(synced.has(name)) await remove(name);
      due.delete(name); retryAt.delete(name);
    }catch(err){
      log(name + ": " + (err.message || err) + " — trying again in a minute");
      retryAt.set(name, now + RETRY_MS);
    }
  }
}

async function start(){
  // What's in the table already, so an unchanged note isn't sent again.
  const { data, error } = await sb.from(TABLE).select("file,sha");
  if(error){
    log("can't read " + TABLE + ": " + error.message + (/find|exist/i.test(error.message) ? " — has supabase/log.sql been run?" : ""));
    process.exit(1);
  }
  data.forEach(r => synced.set(r.file, r.sha));
  log("watching the Log folder; " + data.length + " notes in the table");

  if(ONCE){
    // No settling wait: everything is due now. Keep going until all are done
    // or only failures are left.
    await tick();
    for(const k of due.keys()) due.set(k, 0);
    await tick();
    if(due.size){ log(due.size + " note(s) couldn't be brought in line; see above."); process.exit(1); }
    log("done");
    return;
  }
  const loop = async () => { await tick(); setTimeout(loop, POLL_MS); };
  loop();
}

start().catch(err => { log(err.stack || err); process.exit(1); });
