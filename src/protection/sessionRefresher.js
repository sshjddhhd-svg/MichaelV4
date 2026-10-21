/**
 * Djamel-Fca Architecte Core — Session State Monitor
 * Keeps the current AppState available and reports session loss.
 * It does not rotate credentials or attempt to bypass platform controls.
 */
"use strict";
let timer = null;
let active = false;
let lastFingerprint = "";

function fingerprint(state) {
  return (state || []).map(c => `${c.key}=${c.value}`).sort().join(";");
}

function start(api) {
  if (global.GoatBot?.config?.sessionMonitor?.enable === false) return;
  if (timer || !api) return;
  active = true;
  const interval = Math.max(60, Number(global.GoatBot?.config?.sessionMonitor?.intervalSeconds || 300)) * 1000;
  const check = () => {
    try {
      const state = api.getAppState?.() || [];
      if (!state.length) {
        global.log?.warn?.("SESSION", "AppState is empty");
        return;
      }
      const fp = fingerprint(state);
      if (lastFingerprint && fp !== lastFingerprint) {
        global.log?.info?.("SESSION", "AppState changed");
        try {
          if (global._writeAppState) global._writeAppState(state);
        } catch (_) {}
      }
      lastFingerprint = fp;
    } catch (e) {
      global.log?.warn?.("SESSION", e.message || String(e));
    }
  };
  check();
  timer = setInterval(check, interval);
  if (timer.unref) timer.unref();
}

function stop() { if (timer) clearInterval(timer); timer = null; active = false; }
module.exports = { start, stop, isActive: () => active };
