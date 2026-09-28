#!/usr/bin/env node
/* ==========================================================================
   publish-literature — copies the literature plan into Supabase for #ela.

   The vault is the source of truth: the plan is written and ticked in
   Obsidian, and the page only displays it. The page can't reach a folder on
   this Mac, and the plan can't go in the repo (everything in the repo is
   public), so this watches the one file and uploads it to the private
   `literature` bucket whenever it changes. Only the parent account can read it
   there — see supabase/literature.sql.

   It runs at login as a launchd agent (scripts/launchd/, and the README). By hand:

     cd scripts && npm install          (once)
     node scripts/publish-literature.mjs            watch, and upload on change
     node scripts/publish-literature.mjs --once     upload now and stop

   scripts/.env holds SB_URL and SB_SERVICE_KEY (the secret key, sb_secret_…),
   the same file vault-sync reads. It is gitignored.

   What this may touch in the vault is exactly one file, SOURCE below. It
   never lists a folder, never opens another file, never writes anything
   there. It watches by polling that one path's modification time rather than
   watching the folder, so it doesn't even see other files' names go by.
   ========================================================================== */

import { createClient } from "@supabase/supabase-js";
import { readFile, stat, watchFile } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const readFileP = promisify(readFile);
const statP = promisify(stat);

const SOURCE = "/Users/caseyking/Library/Mobile Documents/iCloud~md~obsidian/Documents/HomeSchool/Planning/Literature Lesson Plan 2026-2027.md";

const BUCKET = "literature";
const OBJECT = "literature-plan-2026-2027.md";   // must match ELA_FILE in index.html

const POLL_MS   = 2000;   // how often to look at the file's modification time
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

let lastHash = null;      // what's in the bucket, as far as this run knows
let busy = false, again = false, retry = null;

async function publish(reason){
  if(busy){ again = true; return; }
  busy = true;
  try{
    const body = await readFileP(SOURCE);
    const hash = createHash("sha256").update(body).digest("hex");
    if(hash === lastHash){ log("unchanged (" + reason + "), nothing to upload"); return; }
    const { error } = await sb.storage.from(BUCKET).upload(OBJECT, body, {
      upsert: true,
      contentType: "text/markdown; charset=utf-8",
      cacheControl: "0",        // the page must never be shown a stale copy
    });
    if(error) throw error;
    lastHash = hash;
    log("uploaded (" + reason + "), " + body.length + " bytes");
  }catch(err){
    // A failed upload leaves lastHash alone, so the next change — or the
    // retry below — tries again.
    log("upload failed (" + reason + "):", err && (err.message || err));
    clearTimeout(retry);
    retry = setTimeout(() => publish("retry"), 60000);
  }finally{
    busy = false;
    if(again){ again = false; publish("queued change"); }
  }
}

const once = process.argv.includes("--once");

try{ await statP(SOURCE); }
catch(err){
  log("can't see the plan at", SOURCE, "—", err.code || err.message);
  if(err.code === "EPERM" || err.code === "EACCES")
    log("macOS is blocking access to iCloud Drive. Give node Full Disk Access: " +
        "System Settings › Privacy & Security › Full Disk Access › + › " + process.execPath);
  if(once) process.exit(1);
  // Otherwise keep watching: the file may simply not have synced down yet.
}

await publish("start");
if(once) process.exit(0);

let timer = null;
watchFile(SOURCE, { interval: POLL_MS, persistent: true }, (cur, prev) => {
  if(cur.mtimeMs === prev.mtimeMs && cur.size === prev.size) return;
  if(cur.nlink === 0 && cur.mtimeMs === 0){ log("the plan is missing (moved or mid-sync); waiting"); return; }
  clearTimeout(timer);
  timer = setTimeout(() => publish("changed"), SETTLE_MS);
});
log("watching", path.basename(SOURCE));
