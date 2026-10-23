/**
 * Djamel-Fca Architecte — fallback poller.
 *
 * This poller intentionally does not impersonate the native message listener:
 * getThreadList is only a health/keepalive check, not a message event source.
 * If FCA's listen()/listenMqtt() has failed, this fallback cannot safely rebuild
 * message events from a thread-list snapshot, so it reports that limitation.
 */
"use strict";

let active = false;
let timer = null;
let running = false;

function stopPoller() {
  active = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

function startPoller(api, handlerFn, intervalMs = 6000) {
  if (active) return;
  if (!api || typeof api.getThreadList !== "function") {
    global.log?.error?.("POLLER", "لا تتوفر getThreadList؛ تعذر بدء فحص الاتصال البديل.");
    return;
  }

  active = true;
  const safeInterval = Math.max(1000, Number(intervalMs) || 6000);
  global.log?.warn?.(
    "POLLER",
    `بدأ فحص احتياطي لقائمة المجموعات كل ${safeInterval}ms. هذا الفحص لا يستقبل محتوى الرسائل؛ مستمع FCA مطلوب لمراقبتها.`
  );

  async function poll() {
    if (!active || running) return;
    running = true;
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const done = (err, data) => {
          if (settled) return;
          settled = true;
          if (err) reject(err);
          else resolve(data);
        };
        try {
          const ret = api.getThreadList(10, null, ["INBOX"], done);
          if (ret && typeof ret.then === "function") ret.then(v => done(null, v), done);
        } catch (err) {
          done(err);
        }
      });
      global.lastMqttActivity = Date.now();
    } catch (err) {
      global.log?.warn?.("POLLER", err?.message || String(err));
    } finally {
      running = false;
      if (active) timer = setTimeout(poll, safeInterval);
    }
  }

  poll().catch(err => global.log?.warn?.("POLLER", err?.message || String(err)));
}

module.exports = { startPoller, stopPoller, isActive: () => active };
