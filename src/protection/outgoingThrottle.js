/**
 * Djamel-Fca Architecte Core — Outgoing Message Guard
 * Copyright © 2026 DJAMEL
 * Purpose: serialize outgoing messages per thread and enforce a safe send rate.
 */
"use strict";

const queues = new Map();
const patched = new WeakSet();
let active = false;

const cfg = () => global.GoatBot?.config?.outgoingThrottle || {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function limits() {
  const c = cfg();
  return {
    minIntervalMs: Math.max(0, Number(c.minIntervalMs ?? 350)),
    maxQueuePerThread: Math.max(1, Number(c.maxQueuePerThread ?? 12)),
  };
}

function enqueue(threadID, task) {
  const key = String(threadID || "global");
  const q = queues.get(key) || { running: false, items: [], lastSent: 0 };
  const { maxQueuePerThread } = limits();

  if (q.items.length >= maxQueuePerThread) {
    return Promise.reject(new Error("OUTGOING_QUEUE_FULL"));
  }

  const promise = new Promise((resolve, reject) => q.items.push({ task, resolve, reject }));
  queues.set(key, q);
  drain(key).catch(() => {});
  return promise;
}

async function drain(key) {
  const q = queues.get(key);
  if (!q || q.running) return;
  q.running = true;

  try {
    while (q.items.length) {
      const item = q.items.shift();
      const { minIntervalMs } = limits();
      const wait = Math.max(0, minIntervalMs - (Date.now() - q.lastSent));
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
  if (cfg().enable === false) return;
  if (!api || typeof api.sendMessage !== "function" || patched.has(api)) return;
  const original = api.sendMessage.bind(api);

  api.sendMessage = function guardedSendMessage(message, threadID, callback) {
    return enqueue(threadID, () => new Promise((resolve, reject) => {
      let finished = false;
      const done = (err, result) => {
        if (finished) return;
        finished = true;
        try { if (typeof callback === "function") callback(err || null, result); } catch (_) {}
        if (err) reject(err); else resolve(result);
      };

      try {
        const ret = original(message, threadID, done);
        if (ret && typeof ret.then === "function") ret.then(v => done(null, v), done);
      } catch (err) {
        done(err);
      }
    }));
  };

  patched.add(api);
  active = true;
}

function stop() {
  for (const q of queues.values()) q.items.length = 0;
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
