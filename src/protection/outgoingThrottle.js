/**
 * Outgoing message guard with per-thread serialization and optional typing delay.
 * This protects against bursts; it does not attempt to evade platform safeguards.
 */
"use strict";

const queues = new Map();
const patched = new WeakMap();
let active = false;

const getCfg = () => global.GoatBot?.config?.outgoingThrottle || {};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function limits() {
  const c = getCfg();
  return {
    minIntervalMs: Math.max(0, Number(c.minIntervalMs ?? 350)),
    maxQueuePerThread: Math.max(1, Number(c.maxQueuePerThread ?? 12)),
    typingEnabled: c.humanTyping !== false,
    typingMinMs: Math.max(0, Number(c.typingMinMs ?? 500)),
    typingMaxMs: Math.max(0, Number(c.typingMaxMs ?? 2500)),
  };
}

function enqueue(threadID, task) {
  const key = String(threadID || "global");
  const q = queues.get(key) || { running: false, items: [], lastSent: 0 };
  const cfg = limits();

  if (q.items.length >= cfg.maxQueuePerThread) {
    return Promise.reject(new Error("OUTGOING_QUEUE_FULL"));
  }

  const promise = new Promise((resolve, reject) => q.items.push({ task, resolve, reject }));
  queues.set(key, q);
  void drain(key);
  return promise;
}

async function waitForHumanTyping(api, threadID, message) {
  const cfg = limits();
  if (!cfg.typingEnabled) return;
  const typing = require("./humanTyping");
  const delay = (() => {
    try {
      const text = typeof message === "string" ? message : message?.body || "";
      const calculated = Number(global.utils?.calcHumanTypingDelay?.(text)) || 0;
      return Math.min(cfg.typingMaxMs, Math.max(cfg.typingMinMs, calculated || cfg.typingMinMs));
    } catch (_) {
      return cfg.typingMinMs;
    }
  })();

  try {
    // This is the shared typing integration used by the app (including FCA's
    // simulator when available), not a separate delay-only implementation.
    await typing.beforeSend(api, threadID, message, delay);
  } catch (err) {
    global.log?.warn?.("TYPING", err?.message || String(err));
    await sleep(delay);
  }
}
async function drain(key) {
  const q = queues.get(key);
  if (!q || q.running) return;
  q.running = true;

  try {
    while (q.items.length) {
      const item = q.items.shift();
      const cfg = limits();
      const wait = Math.max(0, cfg.minIntervalMs - (Date.now() - q.lastSent));
      if (wait) await sleep(wait);

      try {
        const result = await item.task();
        q.lastSent = Date.now();
        item.resolve(result);
      } catch (err) {
        q.lastSent = Date.now();
        item.reject(err);
      }
    }
  } finally {
    q.running = false;
    if (!q.items.length) queues.delete(key);
  }
}

function wrapSendMessage(api) {
  if (!api || typeof api.sendMessage !== "function" || patched.has(api)) return;
  const original = api.sendMessage.bind(api);

  const wrapped = function guardedSendMessage(message, threadID, callback) {
    return enqueue(threadID, async () => {
      await waitForHumanTyping(api, threadID, message);
      return new Promise((resolve, reject) => {
        let finished = false;
        let timeout = null;
        const done = (err, result) => {
          if (finished) return;
          finished = true;
          if (timeout) clearTimeout(timeout);
          try { if (typeof callback === "function") callback(err || null, result); } catch (_) {}
          if (err) reject(err); else resolve(result);
        };
        timeout = setTimeout(() => done(new Error("SEND_MESSAGE_TIMEOUT: no callback from API within 25000ms")), 25_000);

        try {
          const ret = original(message, threadID, done);
          if (ret && typeof ret.then === "function") ret.then(v => done(null, v), done);
        } catch (err) {
          done(err);
        }
      });
    });
  };

  api.sendMessage = wrapped;
  patched.set(api, { original, wrapped });
  active = true;
}

function stop() {
  // Rejecting queued tasks ensures callers do not wait forever after reconnect.
  for (const q of queues.values()) {
    for (const item of q.items.splice(0)) item.reject(new Error("OUTGOING_STOPPED"));
  }
  queues.clear();
  active = false;
}

function start(api) { wrapSendMessage(api); }

module.exports = {
  start,
  stop,
  wrapSendMessage,
  enqueue,
  isActive: () => active,
  getQueueSize: threadID => queues.get(String(threadID || "global"))?.items.length || 0,
};
