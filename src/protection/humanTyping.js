/**
 * Human typing integration shared by command replies and outgoing guard.
 * Provides a consistent API adapter hook and reports active state accurately.
 */
"use strict";

let apiRef = null;
let active = false;
const patchedApis = new WeakSet();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function textOf(message) {
  if (typeof message === "string") return message;
  if (message && typeof message.body === "string") return message.body;
  return "";
}

function getDelay(message) {
  let calculated = 0;
  try {
    calculated = Number(global.utils?.calcHumanTypingDelay?.(textOf(message))) || 0;
  } catch (_) {}
  return Math.max(500, Math.min(10_000, calculated || 1200));
}

async function beforeSend(api, threadID, message, overrideMs) {
  const ms = Math.max(0, Math.min(10_000, Number(overrideMs) || getDelay(message)));
  if (typeof global.utils?.simulateTyping === "function") {
    try {
      await global.utils.simulateTyping(api, threadID, ms);
      return ms;
    } catch (err) {
      global.log?.warn?.("TYPING", err?.message || String(err));
    }
  }
  await sleep(ms);
  return ms;
}

function start(api) {
  if (!api) return false;
  apiRef = api;
  active = typeof api.sendMessage === "function";
  return active;
}

function wrapWithTyping(api) {
  if (!api || typeof api.sendMessage !== "function" || patchedApis.has(api)) return false;
  const original = api.sendMessage.bind(api);

  api.sendMessage = function sendMessageWithTyping(message, threadID, callback) {
    // Keep callback-style semantics expected by FCA. Return the promise so modern callers
    // can await it, and pass callback errors through unchanged.
    const task = beforeSend(api, threadID, message).then(() => new Promise((resolve, reject) => {
      let settled = false;
      const done = (err, result) => {
        if (settled) return;
        settled = true;
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
    task.catch(err => global.log?.warn?.("TYPING", err?.message || String(err)));
    return task;
  };

  patchedApis.add(api);
  apiRef = api;
  active = true;
  return true;
}

function stop() {
  apiRef = null;
  active = false;
}

module.exports = {
  start,
  wrapWithTyping,
  beforeSend,
  getDelay,
  stop,
  isActive: () => active,
  getApi: () => apiRef
};
