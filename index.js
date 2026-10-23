/**
 * Djamel-Fca Architecte — resilient runtime launcher
 * Restarts the runtime with bounded exponential backoff.
 */
"use strict";
const { spawn } = require("child_process");
const path = require("path");
const BASE_DELAY = 3000;
const MAX_DELAY = 5 * 60 * 1000;
let delay = BASE_DELAY;
let child = null;
let stableTimer = null;
let restartTimer = null;
let shuttingDown = false;
let generation = 0;

function scheduleRestart(reason) {
  if (shuttingDown || restartTimer) return;
  clearTimeout(stableTimer);
  stableTimer = null;
  const wait = delay;
  console.error(`[launcher] Runtime stopped (${reason}); restarting in ${wait}ms`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    delay = Math.min(Math.ceil(delay * 1.8), MAX_DELAY);
    start();
  }, wait);
}

function start() {
  if (shuttingDown || child) return;
  const id = ++generation;
  let spawned = false;
  try {
    const proc = spawn(process.execPath, ["--max-old-space-size=400", path.join(__dirname, "core-runtime-source.js")], {
      stdio: "inherit",
      env: { ...process.env }
    });
    child = proc;
    proc.once("spawn", () => { spawned = true; });
    stableTimer = setTimeout(() => {
      if (child === proc && generation === id) delay = BASE_DELAY;
    }, 10 * 60 * 1000);
    proc.once("error", err => {
      console.error("[launcher] Failed to spawn runtime:", err.message || err);
      if (child === proc) child = null;
      scheduleRestart("spawn error");
    });
    proc.once("exit", (code, signal) => {
      if (child === proc) child = null;
      clearTimeout(stableTimer);
      stableTimer = null;
      if (shuttingDown) return;
      if (code === 0) {
        delay = BASE_DELAY;
        if (!restartTimer) restartTimer = setTimeout(() => { restartTimer = null; start(); }, 1000);
      } else {
        scheduleRestart(`exit code=${code} signal=${signal || "none"}`);
      }
    });
  } catch (err) {
    child = null;
    scheduleRestart(err.message || "spawn exception");
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(restartTimer);
  clearTimeout(stableTimer);
  try { child?.kill(signal); } catch (_) {}
  setTimeout(() => process.exit(0), 1500).unref?.();
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shutdown(signal));
start();
