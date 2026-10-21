/**
 * Djamel-Fca Architecte — resilient runtime launcher
 * Core By Djamel
 */
"use strict";
const { spawn } = require("child_process");
const path = require("path");
const MAX_RESTARTS = 25;
const BASE_DELAY = 3000;
const MAX_DELAY = 5 * 60 * 1000;
let restarts = 0, delay = BASE_DELAY, child = null, stable = null;
function start() {
  if (restarts >= MAX_RESTARTS) return process.exit(1);
  restarts++;
  child = spawn(process.execPath, ["--max-old-space-size=400", path.join(__dirname, "core-runtime-source.js")], { stdio:"inherit", env:{...process.env} });
  clearTimeout(stable);
  stable = setTimeout(() => { restarts = 0; delay = BASE_DELAY; }, 10 * 60 * 1000);
  child.once("exit", (code, signal) => {
    clearTimeout(stable);
    if (code === 0) { restarts = 0; delay = BASE_DELAY; return setTimeout(start, 1000); }
    setTimeout(() => { delay = Math.min(delay * 1.8, MAX_DELAY); start(); }, delay);
  });
  child.once("error", () => setTimeout(start, delay));
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { try { child?.kill(sig); } finally { process.exit(0); } });
start();
