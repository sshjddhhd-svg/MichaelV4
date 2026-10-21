/** Djamel-Fca Architecte Core — Duplicate Event Guard */
"use strict";
const seen = new Map();
const DEFAULT_TTL = 60 * 1000;

function isDuplicate(id, ttl = DEFAULT_TTL) {
  if (!id) return false;
  const key = String(id);
  const now = Date.now();
  const old = seen.get(key);
  if (old && now - old < ttl) return true;
  seen.set(key, now);
  return false;
}

function cleanup() {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [k, ts] of seen) if (ts < cutoff) seen.delete(k);
}
const timer = setInterval(cleanup, 60 * 1000);
if (timer.unref) timer.unref();

module.exports = { isDuplicate, cleanup, clear: () => seen.clear() };
