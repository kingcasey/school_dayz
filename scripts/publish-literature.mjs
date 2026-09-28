#!/usr/bin/env node
/* ==========================================================================
   publish-literature — copies the lesson plans into Supabase for #ela and
   #history.

   The vault is where the plans are written; the page shows them and keeps
   their ticks in Supabase. The page can't reach a folder on this Mac, and the
   plans can't go in the repo (everything in the repo is public), so this
   watches the two files and uploads each to the private `literature` bucket
   whenever it changes. Only the parent account can read them there — see
   supabase/literature.sql.

   It runs at login as a launchd agent (scripts/launchd/, and the README). By hand:

     cd scripts && npm install          (once)
     node scripts/publish-literature.mjs            watch, and upload on change
     node scripts/publish-literature.mjs --once     upload both now and stop

   scripts/.env holds SB_URL and SB_SERVICE_KEY (the secret key, sb_secret_…),
   the same file vault-sync reads. It is gitignored.

   What this may touch in the vault is exactly the files in FILES below. It
   never lists a folder, never opens another file, never writes anything
   there. It watches by polling each path's modification time rather than
   watching the folder, so it doesn't even see other files' names go by.
   ========================================================================== */

import { createClient } from "@supabase/supabase-js";
import { readFile, watchFile } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const readFileP = promisify(readFile);

const PLANNING = "/Users/caseyking/Library/Mobile Documents/iCloud~md~obsidian/Documents/HomeSchool/Planning/";

/* Each file and the name it goes by in the bucket — which must match
   LESSON_FILES in index.html. These and nothing else. */
const FILES = [
  { source: PLANNING + "Literature Lesson Plan 2026-2027.md",  object: "literature-plan-2026-2027.md" },
  { source: PLANNING + "US History Lesson Plan 2026-2027.md",  object: "us-history-plan-2026-2027.md" },
];

const BUCKET = "literature";

const POLL_MS   = 2000;   // how often to look at a file's modification time
const SETTLE_MS = 5000;   // iCloud writes in bursts: wait this long after the last change

const HERE = path.dirname(fileURLToPath(import.meta.url));

function log(...a){ console.log(new Date().toISOString(), ...a); }

try{ process.loadEnvFile(path.join(HERE, ".env")); }
catch(err){
  if(err.code!=="ENOENT") throw err;       // no .env is fine if the variables are set some other way
}
const { SB_URL, SB_SERVICE_KEY } = process.env;
if(!SB_URL || !SB_SERVICE_KEY){
  log("SB_URL and SB_SERVICE_KEY are needed, in scripts/.env. Stopping.");
  process.exit(1);
}

const sb = createClient(SB_URL, SB_SERVICE_KEY, { auth: { persistSession: false } });

/* Per file: what's in the bucket as far as this run knows, and whether an
   upload is under way, queued behind one, or waiting to retry. */
FILES.forEach(f => Object.assign(f, {
  name: path.basename(f.source), lastHash: null, busy: false, again: false, retry: null, timer: null,
}));

async function publish(f, reason){
  if(f.busy){ f.again = true; return true; }
  f.busy = true;
  try{
    const body = await readFileP(f.source);
    const hash = createHash("sha256").update(body).digest("hex");
    if(hash === f.lastHash){ log(f.name + ": unchanged (" + reason + "), nothing to upload"); return true; }
    const { error } = await sb.storage.from(BUCKET).upload(f.object, body, {
      upsert: true,
      contentType: "text/markdown; charset=utf-8",
      cacheControl: "0",        // the page must never be shown a stale copy
    });
    if(error) throw error;
    f.lastHash = hash;
    log(f.name + ": uploaded (" + reason + "), " + body.length + " bytes");
    return true;
  }catch(err){
    // A failed upload leaves lastHash alone, so the next change — or the
    // retry below — tries again.
    log(f.name + ": upload failed (" + reason + "):", err && (err.message || err));
    if(err && (err.code === "EPERM" || err.code === "EACCES"))
      log("macOS is blocking access to iCloud Drive. Give node Full Disk Access: " +
          "System Settings › Privacy & Security › Full Disk Access › + › " + process.execPath);
    clearTimeout(f.retry);
    f.retry = setTimeout(() => publish(f, "retry"), 60000);
    return false;
  }finally{
    f.busy = false;
    if(f.again){ f.again = false; publish(f, "queued change"); }
  }
}

const once = process.argv.includes("--once");

// One file missing (not synced down yet, say) doesn't stop the other.
const results = await Promise.all(FILES.map(f => publish(f, "start")));
if(once){
  FILES.forEach(f => clearTimeout(f.retry));
  process.exit(results.every(Boolean) ? 0 : 1);
}

FILES.forEach(f => {
  watchFile(f.source, { interval: POLL_MS, persistent: true }, (cur, prev) => {
    if(cur.mtimeMs === prev.mtimeMs && cur.size === prev.size) return;
    if(cur.nlink === 0 && cur.mtimeMs === 0){ log(f.name + ": missing (moved or mid-sync); waiting"); return; }
    clearTimeout(f.timer);
    f.timer = setTimeout(() => publish(f, "changed"), SETTLE_MS);
  });
  log("watching", f.name);
});
