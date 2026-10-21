/** Djamel-Fca Architecte Core — Inbound Rate Limit */
"use strict";
const store = new Map();
function check(key, max = 8, windowMs = 6000) {
  try {
    const now = Date.now();
    const k = String(key);
    const entry = store.get(k) || { e: [], w: false };
    entry.e = entry.e.filter(t => now - t < windowMs);
    entry.e.push(now);
    store.set(k, entry);
    return { exceeded: entry.e.length > max, count: entry.e.length, warned: entry.w };
  } catch (_) { return { exceeded: false, count: 0, warned: false }; }
}
function setWarned(key) { const v = store.get(String(key)); if (v) v.w = true; }
function reset(key) { store.delete(String(key)); }
const timer = setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [k, v] of store) {
    v.e = v.e.filter(t => t >= cutoff);
    if (!v.e.length) store.delete(k);
  }
}, 60 * 1000);
if (timer.unref) timer.unref();
module.exports = { check, setWarned, reset };
